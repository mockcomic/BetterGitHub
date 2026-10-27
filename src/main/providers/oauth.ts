import { randomBytes, randomUUID, createHash } from 'crypto'
import { createServer, type Server } from 'http'
import type {
  AccountProvider,
  SignInChallenge,
  SignInStatus
} from '../../shared/models'
import { addAccount, type AccountCredential } from '../accounts'
import { getAccountsConfig } from '../settings'
import {
  githubClient,
  githubSiteRoot,
  normalizeGitHubApiBase
} from './github'
import { gitlabClient } from './gitlab'
import { apiFetch, providerErrorMessage, str, type ApiResponse } from './http'
import { GITLAB_REDIRECT_PORT, GITLAB_REDIRECT_URI } from './config'

/**
 * Browser sign-in flows, kept entirely in main so tokens never touch the
 * renderer:
 *
 * - **GitHub** uses the OAuth **device flow**: main fetches a device code,
 *   the user types the short code at github.com/login/device, main polls
 *   until GitHub says yes. No localhost port, works with proxies, and the
 *   client id is public by design.
 * - **GitLab** uses **authorization-code + PKCE** against the instance the
 *   user signs into: main opens the authorize URL and catches the redirect
 *   on a one-shot 127.0.0.1 server (the fixed port must match the
 *   registered application's redirect URI), then exchanges the code with
 *   the verifier. PKCE keeps the exchange secret-free (public client).
 *
 * Every challenge is in-memory, single per provider, and dies on expiry,
 * cancel, or the next beginSignIn.
 */

interface PendingSignIn {
  readonly requestId: string
  readonly provider: AccountProvider
  readonly apiBase: string
  readonly clientId: string
  readonly kind: SignInChallenge['kind']
  readonly expiresAt: number
  /** github device */
  deviceCode?: string
  intervalMs: number
  nextPollAt: number
  /** gitlab PKCE */
  verifier?: string
  state?: string
  code?: string
  denied?: string
  server?: Server
}

const pending = new Map<string, PendingSignIn>()

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function sweepExpired(): void {
  const now = Date.now()
  for (const entry of pending.values()) {
    if (entry.expiresAt <= now) closeEntry(entry)
  }
}

function closeEntry(entry: PendingSignIn): void {
  entry.server?.close()
  entry.server = undefined
  pending.delete(entry.requestId)
}

async function formPost(url: string, fields: Record<string, string>): Promise<ApiResponse> {
  return apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams(fields).toString()
  })
}

async function beginGitHubDevice(
  apiBase: string,
  clientId: string
): Promise<SignInChallenge> {
  const res = await formPost(`${githubSiteRoot(apiBase)}/login/device/code`, {
    client_id: clientId,
    scope: 'repo'
  })
  if (!res.ok) {
    throw new Error(
      `GitHub refused the device sign-in start (HTTP ${res.status}). Check the OAuth App's client id in Preferences → Accounts.`
    )
  }
  const deviceCode = str(res.json.device_code)
  const userCode = str(res.json.user_code)
  const verificationUrl = str(res.json.verification_uri)
  if (deviceCode === null || userCode === null || verificationUrl === null) {
    throw new Error('GitHub returned an unreadable device-code response.')
  }
  const intervalSec =
    typeof res.json.interval === 'number' && res.json.interval >= 1
      ? res.json.interval
      : 5
  const expiresSec =
    typeof res.json.expires_in === 'number' && res.json.expires_in > 0
      ? res.json.expires_in
      : 900
  const entry: PendingSignIn = {
    requestId: randomUUID(),
    provider: 'github',
    apiBase,
    clientId,
    kind: 'github-device',
    expiresAt: Date.now() + expiresSec * 1000,
    deviceCode,
    intervalMs: intervalSec * 1000,
    nextPollAt: Date.now() + intervalSec * 1000
  }
  pending.set(entry.requestId, entry)
  return {
    kind: 'github-device',
    requestId: entry.requestId,
    userCode,
    verificationUrl,
    expiresAt: entry.expiresAt,
    intervalMs: entry.intervalMs
  }
}

function callbackPage(title: string, message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>GitDesk — ${title}</title>` +
    `<body style="font:14px -apple-system,'Segoe UI',sans-serif;padding:40px;">` +
    `<h2>${title}</h2><p>${message}</p>`
}

function startGitLabCallbackServer(entry: PendingSignIn): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${GITLAB_REDIRECT_PORT}`)
      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      const error = url.searchParams.get('error')
      const state = url.searchParams.get('state')
      const code = url.searchParams.get('code')
      if (error !== null) {
        entry.denied = url.searchParams.get('error_description') ?? error
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(callbackPage('Sign-in failed', 'GitDesk was denied access. Close this tab and try again.'))
        return
      }
      if (state !== entry.state || code === null) {
        entry.denied = 'The sign-in callback did not match this request.'
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(callbackPage('Sign-in failed', 'The callback did not match GitDesk. Close this tab and try again.'))
        return
      }
      entry.code = code
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(callbackPage('Signed in', 'GitDesk received your GitLab authorization. You can close this tab and return to GitDesk.'))
    })
    server.once('error', err => {
      reject(
        new Error(
          `Could not listen on 127.0.0.1:${GITLAB_REDIRECT_PORT} for the GitLab redirect (${err.message}). ` +
          `Close whatever holds the port, or sign in with a token instead.`
        )
      )
    })
    server.listen(GITLAB_REDIRECT_PORT, '127.0.0.1', () => {
      entry.server = server
      resolve()
    })
  })
}

async function beginGitLabBrowser(
  apiBase: string,
  clientId: string
): Promise<SignInChallenge> {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = randomBytes(16).toString('hex')
  const authorizeUrl =
    `${apiBase}/oauth/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(GITLAB_REDIRECT_URI)}` +
    `&scope=api` +
    `&state=${state}` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256`
  const entry: PendingSignIn = {
    requestId: randomUUID(),
    provider: 'gitlab',
    apiBase,
    clientId,
    kind: 'gitlab-browser',
    // Generous human window: read the page, log in, approve.
    expiresAt: Date.now() + 5 * 60_000,
    intervalMs: 1000,
    nextPollAt: Date.now(),
    verifier,
    state
  }
  try {
    await startGitLabCallbackServer(entry)
  } catch (err) {
    entry.server?.close()
    throw err
  }
  pending.set(entry.requestId, entry)
  return { kind: 'gitlab-browser', requestId: entry.requestId, authorizeUrl }
}

/** Start a browser sign-in for a provider; returns what the UI must show. */
export async function beginSignIn(
  provider: AccountProvider,
  apiBase?: string
): Promise<SignInChallenge> {
  sweepExpired()
  // One live challenge per provider: a second begin replaces the first.
  for (const entry of [...pending.values()]) {
    if (entry.provider === provider) closeEntry(entry)
  }
  const config = await getAccountsConfig()
  const clientId = provider === 'github' ? config.githubClientId : config.gitlabClientId
  if (clientId.length === 0) {
    throw new Error(
      provider === 'github'
        ? 'GitHub browser sign-in needs an OAuth App client id (with Device Flow enabled) — enter it in Preferences → Accounts, or sign in with a personal access token.'
        : 'GitLab browser sign-in needs an application id (redirect URI http://127.0.0.1:8765/callback) — enter it in Preferences → Accounts, or sign in with a personal access token.'
    )
  }
  // The stored apiBase follows each provider's token sign-in convention
  // (GitHub: REST root, GitLab: site root) so both sign-in paths replace
  // the same account row for the same user + instance.
  const root = instanceRoot(
    apiBase,
    provider === 'github' ? 'https://github.com' : 'https://gitlab.com'
  )
  // GitHub stores the REST root (like token sign-in); GitLab the site root.
  const base = provider === 'github' ? normalizeGitHubApiBase(root) : root
  return provider === 'github'
    ? beginGitHubDevice(base, clientId)
    : beginGitLabBrowser(base, clientId)
}

/**
 * Site root for either provider (defaults apply when none given; an
 * enterprise root may carry an API path suffix, which is stripped).
 */
function instanceRoot(apiBase: string | undefined, fallback: string): string {
  const value =
    apiBase === undefined || apiBase.trim().length === 0 ? fallback : apiBase.trim()
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`)
  const path = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/api\/v3$/i, '')
    .replace(/\/api\/v4$/i, '')
  return `${url.origin}${path}`
}

async function pollGitHub(entry: PendingSignIn): Promise<SignInStatus> {
  if (entry.deviceCode === undefined) {
    return { status: 'failed', message: 'This sign-in is no longer pending — start it again.' }
  }
  const res = await formPost(
    `${githubSiteRoot(entry.apiBase)}/login/oauth/access_token`,
    {
      client_id: entry.clientId,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: entry.deviceCode
    }
  )
  const error = str(res.json.error)
  if (error !== null) {
    switch (error) {
      case 'authorization_pending':
        entry.nextPollAt = Date.now() + entry.intervalMs
        return { status: 'pending' }
      case 'slow_down':
        entry.intervalMs += 5_000
        entry.nextPollAt = Date.now() + entry.intervalMs
        return { status: 'pending' }
      case 'expired_token':
        closeEntry(entry)
        return { status: 'failed', message: 'The device code expired before it was used. Start sign-in again.' }
      case 'access_denied':
        closeEntry(entry)
        return { status: 'failed', message: 'GitHub denied the sign-in. Start it again and approve the request.' }
      default:
        closeEntry(entry)
        return {
          status: 'failed',
          message: str(res.json.error_description) ?? `GitHub refused sign-in (${error}).`
        }
    }
  }
  const token = str(res.json.access_token)
  if (token === null) {
    closeEntry(entry)
    return { status: 'failed', message: 'GitHub returned no access token.' }
  }
  const identity = await githubClient.validate(entry.apiBase, token, 'oauth')
  const credential: AccountCredential = { token, refreshToken: null, expiresAt: null }
  const account = await addAccount({
    provider: 'github',
    apiBase: entry.apiBase,
    authKind: 'oauth',
    identity,
    credential
  })
  closeEntry(entry)
  return { status: 'signed-in', account }
}

async function pollGitLab(entry: PendingSignIn): Promise<SignInStatus> {
  if (entry.denied !== undefined) {
    const message = entry.denied
    closeEntry(entry)
    return { status: 'failed', message }
  }
  if (entry.code === undefined) return { status: 'pending' }
  const res = await formPost(`${entry.apiBase}/oauth/token`, {
    grant_type: 'authorization_code',
    client_id: entry.clientId,
    code: entry.code,
    code_verifier: entry.verifier ?? '',
    redirect_uri: GITLAB_REDIRECT_URI
  })
  const token = str(res.json.access_token)
  if (!res.ok || token === null) {
    const detail = providerErrorMessage('GitLab', res)
    closeEntry(entry)
    return {
      status: 'failed',
      message: `${detail} If this persists, sign in with a token instead.`
    }
  }
  const expiresIn =
    typeof res.json.expires_in === 'number' && res.json.expires_in > 0
      ? res.json.expires_in
      : 7200
  const credential: AccountCredential = {
    token,
    refreshToken: str(res.json.refresh_token),
    expiresAt: Date.now() + expiresIn * 1000
  }
  const identity = await gitlabClient.validate(entry.apiBase, token, 'oauth')
  const account = await addAccount({
    provider: 'gitlab',
    apiBase: entry.apiBase,
    authKind: 'oauth',
    identity,
    credential
  })
  closeEntry(entry)
  return { status: 'signed-in', account }
}

/** Poll a pending sign-in once. Expired challenges report failed once, then vanish. */
export async function pollSignIn(requestId: string): Promise<SignInStatus> {
  const entry = pending.get(requestId)
  if (entry === undefined) {
    sweepExpired()
    return { status: 'failed', message: 'This sign-in is no longer pending — start it again.' }
  }
  if (entry.expiresAt <= Date.now()) {
    closeEntry(entry)
    return {
      status: 'failed',
      message:
        entry.provider === 'github'
          ? 'The device code expired before it was used. Start sign-in again.'
          : 'The sign-in took too long and expired. Start it again.'
    }
  }
  if (entry.kind === 'github-device' && Date.now() < entry.nextPollAt) {
    return { status: 'pending' }
  }
  return entry.kind === 'github-device' ? pollGitHub(entry) : pollGitLab(entry)
}

export function cancelSignIn(requestId: string): void {
  const entry = pending.get(requestId)
  if (entry !== undefined) closeEntry(entry)
}
