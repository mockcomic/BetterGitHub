import { randomUUID } from 'crypto'
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
import { OAUTH_REDIRECT_PORT, OAUTH_REDIRECT_URI } from './config'
import {
  githubAuthorizeUrl,
  gitlabAuthorizeUrl,
  parseCallbackParams,
  pkceMaterial
} from './oauth-urls'

/**
 * Browser sign-in flows, kept entirely in main so tokens never touch the
 * renderer:
 *
 * - **GitHub web (default)**: OAuth **authorization code + PKCE** (public
 *   client — no client secret). Main opens the authorize URL and catches the
 *   redirect on the shared loopback server, then exchanges the code with the
 *   verifier. Works against github.com and GitHub Enterprise roots alike.
 * - **GitHub device (fallback)**: the `gh` / GitHub Desktop dance — main
 *   fetches a device code, the user types the short code at
 *   github.com/login/device, main polls until GitHub says yes. Used when the
 *   loopback port is busy or the user picks it explicitly.
 * - **GitLab**: the same authorization-code + PKCE shape against the
 *   instance the user signs into.
 *
 * Both web flows share **one** 127.0.0.1 callback server (fixed port, see
 * config.ts): the redirect URI is identical for GitHub and GitLab, and the
 * handler dispatches purely on the unguessable `state` parameter — so a
 * GitHub and a GitLab sign-in can be pending at the same time without the
 * second one failing to bind the port.
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
  /** github/gitlab authorization-code + PKCE */
  verifier?: string
  state?: string
  code?: string
  denied?: string
}

const pending = new Map<string, PendingSignIn>()

/** Live web challenges indexed by their CSRF state token. */
const byState = new Map<string, PendingSignIn>()

let callbackServer: Server | null = null
let callbackStarting: Promise<void> | null = null

function sweepExpired(): void {
  const now = Date.now()
  for (const entry of [...pending.values()]) {
    if (entry.expiresAt <= now) closeEntry(entry)
  }
}

function closeEntry(entry: PendingSignIn): void {
  pending.delete(entry.requestId)
  if (entry.state !== undefined) byState.delete(entry.state)
  pruneCallbackServer()
}

function webChallengesLive(): boolean {
  for (const entry of pending.values()) {
    if (entry.state !== undefined) return true
  }
  return false
}

/** Once no web challenge can still receive a redirect, release the port. */
function pruneCallbackServer(): void {
  if (callbackServer !== null && !webChallengesLive() && callbackStarting === null) {
    callbackServer.close()
    callbackServer = null
  }
}

function callbackPage(title: string, message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Aspen — ${title}</title>` +
    `<body style="font:14px -apple-system,'Segoe UI',sans-serif;padding:40px;">` +
    `<h2>${title}</h2><p>${message}</p>`
}

function providerName(provider: AccountProvider): string {
  return provider === 'github' ? 'GitHub' : 'GitLab'
}

/**
 * Start (once) the shared loopback callback server. The handler is fully
 * provider-agnostic: it only trusts the `state` parameter, which was
 * generated per challenge and is matched against the live web challenges.
 */
function ensureCallbackServer(): Promise<void> {
  if (callbackServer !== null && callbackServer.listening) return Promise.resolve()
  if (callbackStarting !== null) return callbackStarting
  callbackStarting = new Promise<void>((resolve, reject) => {
    const server = createServer((req, res) => {
      const params = parseCallbackParams(req.url ?? '/')
      if (!new URL(req.url ?? '/', 'http://127.0.0.1').pathname.endsWith('/callback')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      const entry = params.state === null ? undefined : byState.get(params.state)
      if (params.error !== null) {
        const message = params.errorDescription ?? params.error
        if (entry !== undefined) entry.denied = message
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(callbackPage('Sign-in failed', `Aspen was denied access (${message}). Close this tab and try again.`))
        return
      }
      if (entry === undefined || params.code === null) {
        if (entry !== undefined) entry.denied = 'The sign-in callback did not match this request.'
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(callbackPage('Sign-in failed', 'The callback did not match Aspen. Close this tab and try again.'))
        return
      }
      entry.code = params.code
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(callbackPage('Signed in', `Aspen received your ${providerName(entry.provider)} authorization. You can close this tab and return to Aspen.`))
    })
    server.once('error', err => {
      callbackStarting = null
      reject(
        new Error(
          `Could not listen on 127.0.0.1:${OAUTH_REDIRECT_PORT} for the browser sign-in redirect (${err.message}). ` +
          `Close whatever holds the port, use the code sign-in, or sign in with a token instead.`
        )
      )
    })
    server.listen(OAUTH_REDIRECT_PORT, '127.0.0.1', () => {
      callbackServer = server
      callbackStarting = null
      resolve()
    })
  })
  return callbackStarting
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

function beginGitHubBrowser(
  apiBase: string,
  clientId: string
): Promise<SignInChallenge> {
  const { verifier, challenge, state } = pkceMaterial()
  const entry: PendingSignIn = {
    requestId: randomUUID(),
    provider: 'github',
    apiBase,
    clientId,
    kind: 'github-browser',
    // Generous human window: read the page, log in, approve.
    expiresAt: Date.now() + 5 * 60_000,
    intervalMs: 1000,
    nextPollAt: Date.now(),
    verifier,
    state
  }
  return ensureCallbackServer().then(() => {
    pending.set(entry.requestId, entry)
    byState.set(state, entry)
    return {
      kind: 'github-browser',
      requestId: entry.requestId,
      authorizeUrl: githubAuthorizeUrl(
        githubSiteRoot(apiBase),
        clientId,
        OAUTH_REDIRECT_URI,
        state,
        challenge
      )
    } satisfies SignInChallenge
  })
}

async function beginGitLabBrowser(
  apiBase: string,
  clientId: string
): Promise<SignInChallenge> {
  const { verifier, challenge, state } = pkceMaterial()
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
  await ensureCallbackServer()
  pending.set(entry.requestId, entry)
  byState.set(state, entry)
  return {
    kind: 'gitlab-browser',
    requestId: entry.requestId,
    authorizeUrl: gitlabAuthorizeUrl(apiBase, clientId, OAUTH_REDIRECT_URI, state, challenge)
  }
}

/**
 * Start a browser sign-in for a provider; returns what the UI must show.
 * `prefer` picks the GitHub flow explicitly ('web' default, 'device' for
 * the code screen); a GitHub web start whose callback port is busy falls
 * back to the device flow automatically.
 */
export async function beginSignIn(
  provider: AccountProvider,
  apiBase?: string,
  prefer?: 'web' | 'device'
): Promise<SignInChallenge> {
  sweepExpired()
  // One live challenge per provider: a second begin replaces the first.
  for (const entry of [...pending.values()]) {
    if (entry.provider === provider) closeEntry(entry)
  }
  const config = await getAccountsConfig()
  const clientId = provider === 'github' ? config.githubClientId : config.gitlabClientId
  if (clientId.length === 0) {
    // Reached only when the id vanished after the panel looked at it (or an
    // IPC caller skipped the panel): the panel's own setup step normally
    // asks for the id before a sign-in ever starts here.
    throw new Error(
      provider === 'github'
        ? 'GitHub browser sign-in needs an OAuth App client id (Device Flow enabled, callback http://127.0.0.1:8765/callback) — press “Sign in with GitHub” again and paste it in the setup step, add one under Preferences → Accounts → Browser sign-in apps, or sign in with a personal access token.'
        : 'GitLab browser sign-in needs an application id (redirect URI http://127.0.0.1:8765/callback) — press “Sign in with GitLab” again and paste it in the setup step, add one under Preferences → Accounts → Browser sign-in apps, or sign in with a personal access token.'
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
  if (provider === 'gitlab') return beginGitLabBrowser(base, clientId)
  if (prefer === 'device') return beginGitHubDevice(base, clientId)
  try {
    return await beginGitHubBrowser(base, clientId)
  } catch {
    // Loopback port busy (or refused): the device flow needs no port.
    return beginGitHubDevice(base, clientId)
  }
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

async function pollGitHubDevice(entry: PendingSignIn): Promise<SignInStatus> {
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
  return finishGitHub(entry, token)
}

async function pollGitHubWeb(entry: PendingSignIn): Promise<SignInStatus> {
  if (entry.denied !== undefined) {
    const message = entry.denied
    closeEntry(entry)
    return { status: 'failed', message }
  }
  if (entry.code === undefined) return { status: 'pending' }
  const res = await formPost(`${githubSiteRoot(entry.apiBase)}/login/oauth/access_token`, {
    grant_type: 'authorization_code',
    client_id: entry.clientId,
    code: entry.code,
    redirect_uri: OAUTH_REDIRECT_URI,
    code_verifier: entry.verifier ?? ''
  })
  const token = str(res.json.access_token)
  if (!res.ok || token === null) {
    const detail = providerErrorMessage('GitHub', res)
    closeEntry(entry)
    return {
      status: 'failed',
      message: `${detail} If this persists, use the one-time code or sign in with a token.`
    }
  }
  // GitHub OAuth tokens do not expire unless the app opted into expiring
  // authorizations — then a refresh token rides along and is stored.
  const expiresAt =
    typeof res.json.expires_in === 'number' && res.json.expires_in > 0
      ? Date.now() + res.json.expires_in * 1000
      : null
  return finishGitHub(entry, token, str(res.json.refresh_token), expiresAt)
}

async function finishGitHub(
  entry: PendingSignIn,
  token: string,
  refreshToken: string | null = null,
  expiresAt: number | null = null
): Promise<SignInStatus> {
  const identity = await githubClient.validate(entry.apiBase, token, 'oauth')
  const credential: AccountCredential = { token, refreshToken, expiresAt }
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
    redirect_uri: OAUTH_REDIRECT_URI
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
          ? 'The sign-in expired before it was approved. Start it again.'
          : 'The sign-in took too long and expired. Start it again.'
    }
  }
  if (entry.kind === 'github-device' && Date.now() < entry.nextPollAt) {
    return { status: 'pending' }
  }
  if (entry.kind === 'github-device') return pollGitHubDevice(entry)
  if (entry.kind === 'github-browser') return pollGitHubWeb(entry)
  return pollGitLab(entry)
}

export function cancelSignIn(requestId: string): void {
  const entry = pending.get(requestId)
  if (entry !== undefined) closeEntry(entry)
}
