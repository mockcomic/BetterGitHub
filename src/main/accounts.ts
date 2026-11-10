import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type {
  AccountAuthKind,
  AccountInfo,
  AccountProvider,
  AccountSyncReport
} from '../shared/models'
import { getAccountsConfig, readSecretFile, writeSecretFile } from './settings'
import { githubClient, githubRepoHost, githubSiteRoot } from './providers/github'
import { gitlabClient } from './providers/gitlab'
import { ProviderHttpError } from './providers/http'
import { githubRefreshToken, gitlabRefreshToken } from './providers/refresh'
import { AVATAR_MAX_BYTES } from './providers/config'
import type { ProviderIdentity } from './providers/types'

/**
 * Signed-in hosted accounts (GitHub/GitLab). Public metadata lives in
 * `aspen-accounts.json` next to the settings file; every token lives in
 * its own safeStorage-encrypted sidecar (the same mechanism as the AI API
 * key) so nothing secret crosses the IPC bridge after sign-in.
 */

/** What the sidecar holds: OAuth secrets can rotate, PATs are static. */
export interface AccountCredential {
  readonly token: string
  readonly refreshToken: string | null
  /** Unix ms when the access token expires; null for PATs/GitHub device. */
  readonly expiresAt: number | null
}

type StoredAccount = AccountInfo

let cached: StoredAccount[] | null = null

/** Fetched avatar data URLs, keyed by account id (small, fixed identity). */
const avatarCache = new Map<string, string | null>()

function accountsPath(): string {
  return join(app.getPath('userData'), 'aspen-accounts.json')
}

function secretPath(id: string): string {
  return join(app.getPath('userData'), `account-token-${id}.bin`)
}

async function load(): Promise<StoredAccount[]> {
  if (cached !== null) return cached
  try {
    if (existsSync(accountsPath())) {
      const raw = await readFile(accountsPath(), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      cached = Array.isArray(parsed) ? (parsed as StoredAccount[]) : []
      return cached
    }
  } catch (err) {
    console.error('Failed to read accounts, using empty list:', err)
  }
  cached = []
  return cached
}

async function persist(): Promise<void> {
  if (cached === null) return
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(accountsPath(), JSON.stringify(cached, null, 2), 'utf8')
}

export async function listAccounts(): Promise<AccountInfo[]> {
  return (await load()).map(a => ({ ...a }))
}

export async function getAccount(id: string): Promise<AccountInfo | null> {
  const found = (await load()).find(a => a.id === id)
  return found ? { ...found } : null
}

/**
 * Remember an account whose credential the caller has just validated
 * against the provider. Replaces any existing account for the same
 * provider + instance + login (re-sign-in rotates the token in place).
 */
export async function addAccount(input: {
  provider: AccountProvider
  apiBase: string
  authKind: AccountAuthKind
  identity: ProviderIdentity
  credential: AccountCredential
}): Promise<AccountInfo> {
  const accounts = await load()
  const replaced = accounts.filter(
    a =>
      a.provider === input.provider &&
      a.apiBase === input.apiBase &&
      a.login === input.identity.login
  )
  for (const old of replaced) {
    await rm(secretPath(old.id), { force: true }).catch(() => undefined)
  }
  const account: StoredAccount = {
    id: randomUUID(),
    provider: input.provider,
    apiBase: input.apiBase,
    login: input.identity.login,
    displayName: input.identity.displayName,
    avatarUrl: input.identity.avatarUrl,
    authKind: input.authKind
  }
  cached = [...accounts.filter(a => !replaced.includes(a)), account]
  await persist()
  await writeSecret(account.id, input.credential)
  avatarCache.delete(account.id)
  for (const old of replaced) avatarCache.delete(old.id)
  return { ...account }
}

export async function removeAccount(id: string): Promise<void> {
  const accounts = await load()
  const found = accounts.find(a => a.id === id)
  if (found === undefined) return
  cached = accounts.filter(a => a.id !== id)
  await persist()
  await rm(secretPath(id), { force: true }).catch(() => undefined)
  avatarCache.delete(id)
}

// ---------------------------------------------------------------------------
// Credential access (main only)

async function readSecret(id: string): Promise<AccountCredential | null> {
  try {
    const raw = await readSecretFile(secretPath(id))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    const json = parsed as Record<string, unknown>
    const token = typeof json.token === 'string' ? json.token : null
    if (token === null || token.length === 0) return null
    return {
      token,
      refreshToken:
        typeof json.refreshToken === 'string' && json.refreshToken.length > 0
          ? json.refreshToken
          : null,
      expiresAt:
        typeof json.expiresAt === 'number' && json.expiresAt > 0
          ? json.expiresAt
          : null
    }
  } catch {
    return null
  }
}

async function writeSecret(id: string, credential: AccountCredential): Promise<void> {
  await writeSecretFile(
    secretPath(id),
    JSON.stringify({
      token: credential.token,
      ...(credential.refreshToken !== null ? { refreshToken: credential.refreshToken } : {}),
      ...(credential.expiresAt !== null ? { expiresAt: credential.expiresAt } : {})
    })
  )
}

/**
 * The account's current access token, refreshing an OAuth token once it is
 * within a minute of its expiry. GitLab access tokens always expire; GitHub
 * ones only do when the OAuth app opted into expiring authorizations —
 * otherwise (and for PATs and device-flow tokens) there is nothing to
 * refresh and a revoked token surfaces as a 401 at the next call. Returns
 * null when the sidecar is unreadable — callers treat that as "signed out".
 */
export async function getAccountToken(
  account: AccountInfo,
  opts?: { forceRefresh?: boolean }
): Promise<string | null> {
  const secret = await readSecret(account.id)
  if (secret === null) return null
  const expiringSoon =
    secret.expiresAt !== null && secret.expiresAt - Date.now() < 60_000
  const refreshable =
    account.authKind === 'oauth' &&
    secret.refreshToken !== null &&
    (expiringSoon || opts?.forceRefresh === true)
  if (refreshable) {
    const { gitlabClientId, githubClientId } = await getAccountsConfig()
    const refreshed =
      account.provider === 'gitlab'
        ? await gitlabRefreshToken(account.apiBase, gitlabClientId, secret)
        : await githubRefreshToken(githubSiteRoot(account.apiBase), githubClientId, secret)
    if (refreshed !== null) {
      await writeSecret(account.id, refreshed)
      return refreshed.token
    }
    // Refresh failed: hand out the old token — it may still work, and the
    // provider's own 401 error is the actionable message.
  }
  return secret.token
}

// ---------------------------------------------------------------------------
// Identity refresh + avatars (main-side helpers for the account UI)

/**
 * Re-validate every stored account against its provider. A working token
 * refreshes the row's display name and avatar (people rename, avatars
 * change); a token the provider now rejects (401/403) signs that account
 * out and destroys its sidecar. Network errors leave everything as-is —
 * offline is not revoked.
 */
export async function syncAccountIdentities(): Promise<AccountSyncReport> {
  const accounts = await load()
  const signedOut: Array<{ login: string; provider: AccountProvider }> = []
  const patches = new Map<string, Partial<AccountInfo>>()
  let changed = false
  for (const account of accounts) {
    const token = await getAccountToken(account)
    if (token === null) continue // sidecar unreadable — next list call explains
    try {
      const identity =
        account.provider === 'github'
          ? await githubClient.validate(account.apiBase, token, account.authKind)
          : await gitlabClient.validate(account.apiBase, token, account.authKind)
      if (
        identity.displayName !== account.displayName ||
        identity.avatarUrl !== account.avatarUrl
      ) {
        patches.set(account.id, {
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl
        })
        avatarCache.delete(account.id)
        changed = true
      }
    } catch (err) {
      if (err instanceof ProviderHttpError && (err.status === 401 || err.status === 403)) {
        signedOut.push({ login: account.login, provider: account.provider })
        await removeAccount(account.id)
        changed = true
      }
      // Anything else (offline, 5xx): keep the account, keep the doubt.
    }
  }
  if (changed && cached !== null) {
    cached = cached.map(a => ({ ...a, ...(patches.get(a.id) ?? {}) }))
    await persist()
  }
  return { accounts: (await load()).map(a => ({ ...a })), signedOut }
}

/**
 * The account's avatar as a `data:` URL, fetched in main and memoized: the
 * renderer CSP never needs a remote image source, and self-hosted GitLab
 * (plain http) works the same as GitHub's CDN. Null when there is no
 * avatar or the fetch failed — the UI falls back to initials.
 */
export async function accountAvatar(account: AccountInfo): Promise<string | null> {
  const hit = avatarCache.get(account.id)
  if (hit !== undefined) return hit
  let dataUrl: string | null = null
  if (account.avatarUrl !== null) {
    try {
      const res = await fetch(account.avatarUrl, {
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow'
      })
      const mime = res.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? ''
      if (res.ok && mime.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > 0 && buf.length <= AVATAR_MAX_BYTES) {
          dataUrl = `data:${mime};base64,${buf.toString('base64')}`
        }
      }
    } catch {
      /* offline or unreachable CDN — initials until the next attempt */
    }
  }
  avatarCache.set(account.id, dataUrl)
  return dataUrl
}

/** The repo host whose https remotes this account's token can authenticate. */
export function accountRepoHost(account: AccountInfo): string {
  return account.provider === 'github'
    ? githubRepoHost(account.apiBase)
    : new URL(account.apiBase).hostname.toLowerCase()
}

/**
 * True when some signed-in GitHub account serves `remoteHost` — the gate on
 * main turning a push permission refusal into the needs-fork message, so a
 * GitLab-only (or signed-out) user is never offered a Create Fork button
 * that could not work (git/sync.ts push).
 */
export async function githubAccountCoversHost(remoteHost: string): Promise<boolean> {
  const wanted = remoteHost.toLowerCase()
  return (await load()).some(
    a => a.provider === 'github' && accountRepoHost(a) === wanted
  )
}

/**
 * The account's git-over-https Basic credential: username + token the host
 * accepts (GitHub: the account login with either token kind; GitLab: the
 * fixed `oauth2` user, valid for PATs and access tokens). Null when the
 * sidecar is unreadable — the caller treats that as "this account cannot
 * authenticate git right now".
 */
export async function accountGitCredential(
  account: AccountInfo
): Promise<{ user: string; token: string } | null> {
  const token = await getAccountToken(account)
  if (token === null) return null
  return {
    user: account.provider === 'gitlab' ? 'oauth2' : account.login,
    token
  }
}

/**
 * Credential for the one-off git auth retry: the first account whose host
 * matches the remote. (Publish pins its push to one chosen account via
 * accountGitCredential instead, so several accounts on one host stay
 * unambiguous there.)
 */
export async function gitRetryCredential(
  remoteHost: string
): Promise<{ user: string; token: string } | null> {
  const wanted = remoteHost.toLowerCase()
  for (const account of await load()) {
    if (accountRepoHost(account) !== wanted) continue
    const credential = await accountGitCredential(account)
    if (credential !== null) return credential
  }
  return null
}
