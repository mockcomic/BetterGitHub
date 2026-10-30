import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type {
  AccountAuthKind,
  AccountInfo,
  AccountProvider
} from '../shared/models'
import { getAccountsConfig, readSecretFile, writeSecretFile } from './settings'
import { githubRepoHost } from './providers/github'
import { gitlabRefreshToken } from './providers/refresh'
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
  return { ...account }
}

export async function removeAccount(id: string): Promise<void> {
  const accounts = await load()
  const found = accounts.find(a => a.id === id)
  if (found === undefined) return
  cached = accounts.filter(a => a.id !== id)
  await persist()
  await rm(secretPath(id), { force: true }).catch(() => undefined)
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
 * The account's current access token, refreshing a GitLab OAuth token once
 * it is within a minute of its expiry (GitHub device tokens do not expire;
 * a revoked one surfaces as a 401 at the next call). Returns null when the
 * sidecar is unreadable — callers treat that as "signed out".
 */
export async function getAccountToken(
  account: AccountInfo,
  opts?: { forceRefresh?: boolean }
): Promise<string | null> {
  const secret = await readSecret(account.id)
  if (secret === null) return null
  const expiringSoon =
    secret.expiresAt !== null && secret.expiresAt - Date.now() < 60_000
  if (
    account.provider === 'gitlab' &&
    account.authKind === 'oauth' &&
    secret.refreshToken !== null &&
    (expiringSoon || opts?.forceRefresh === true)
  ) {
    const { gitlabClientId } = await getAccountsConfig()
    const refreshed = await gitlabRefreshToken(
      account.apiBase,
      gitlabClientId,
      secret
    )
    if (refreshed !== null) {
      await writeSecret(account.id, refreshed)
      return refreshed.token
    }
    // Refresh failed: hand out the old token — it may still work, and the
    // provider's own 401 error is the actionable message.
  }
  return secret.token
}

/** The repo host whose https remotes this account's token can authenticate. */
export function accountRepoHost(account: AccountInfo): string {
  return account.provider === 'github'
    ? githubRepoHost(account.apiBase)
    : new URL(account.apiBase).hostname.toLowerCase()
}

/**
 * Credential for the one-off git auth retry: username + token whose Basic
 * auth the host accepts (GitHub: the account login with either token kind;
 * GitLab: the fixed `oauth2` user, valid for PATs and access tokens).
 */
export async function gitRetryCredential(
  remoteHost: string
): Promise<{ user: string; token: string } | null> {
  const wanted = remoteHost.toLowerCase()
  for (const account of await load()) {
    if (accountRepoHost(account) !== wanted) continue
    const token = await getAccountToken(account)
    if (token === null) continue
    return {
      user: account.provider === 'gitlab' ? 'oauth2' : account.login,
      token
    }
  }
  return null
}
