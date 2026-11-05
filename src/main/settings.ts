import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { app, safeStorage } from 'electron'
import type { ThemeId } from '../shared/themes'
import { isThemeId } from '../shared/themes'
import { pathKey } from './repo-scan-plan'
import type {
  ManagedRepository,
  PublicSettings,
  Repository,
  SettingsPatch
} from '../shared/models'
import {
  DEFAULT_GITHUB_CLIENT_ID,
  DEFAULT_GITLAB_CLIENT_ID
} from './providers/config'

/**
 * JSON settings + repository list in userData, and secrets (the AI API key,
 * account tokens) kept in encrypted sidecar files when the OS supports it
 * (GitHub Desktop used keytar; we use Electron safeStorage).
 */

interface StoredSettings {
  repositories: Repository[]
  ai: { baseUrl: string; model: string; customInstructions: string }
  /**
   * OAuth app ids for browser sign-in. Empty falls back to the compiled
   * defaults in providers/config.ts; a value entered in Preferences wins,
   * which is how a self-built GitHub OAuth App or GitLab application is
   * wired in without rebuilding the app.
   */
  accounts: { githubClientId: string; gitlabClientId: string }
  confirmOverrideWithGeneratedMessage: boolean
  autoRefresh: boolean
  theme: ThemeId
  /** Watch folder for the repository scan; '' = watching off. */
  scanFolder: string
  /**
   * Folders under the watch folder the user removed from the list by hand.
   * The scan honours these so a removal is not undone on the next pass; an
   * entry is forgotten once its folder leaves the disk.
   */
  scanDismissed: string[]
  hintsEnabled: boolean
  /** Silent startup Releases check + background download (see updates.ts). */
  autoUpdateChecks: boolean
}

const DEFAULTS: StoredSettings = {
  repositories: [],
  ai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    customInstructions: ''
  },
  accounts: {
    githubClientId: DEFAULT_GITHUB_CLIENT_ID,
    gitlabClientId: DEFAULT_GITLAB_CLIENT_ID
  },
  confirmOverrideWithGeneratedMessage: true,
  autoRefresh: true,
  theme: 'light',
  hintsEnabled: true,
  autoUpdateChecks: true,
  scanFolder: '',
  scanDismissed: []
}

let cached: StoredSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'aspen-settings.json')
}

function apiKeyPath(): string {
  return join(app.getPath('userData'), 'ai-api-key.bin')
}

async function load(): Promise<StoredSettings> {
  if (cached !== null) return cached
  try {
    if (existsSync(settingsPath())) {
      const raw = await readFile(settingsPath(), 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoredSettings>
      cached = {
        ...DEFAULTS,
        ...parsed,
        ai: { ...DEFAULTS.ai, ...(parsed.ai ?? {}) },
        accounts: { ...DEFAULTS.accounts, ...(parsed.accounts ?? {}) },
        repositories: Array.isArray(parsed.repositories)
          ? parsed.repositories
          : [],
        scanDismissed: Array.isArray(parsed.scanDismissed)
          ? parsed.scanDismissed.filter(x => typeof x === 'string')
          : []
      }
      // The settings file is user-editable and theme ids are a closed
      // registry; anything unknown falls back to the automatic mode
      // rather than selecting a palette with no CSS block (an unskinned
      // :root with only font tokens).
      if (!isThemeId(cached.theme)) cached.theme = DEFAULTS.theme
      return cached
    }
  } catch (err) {
    console.error('Failed to read settings, using defaults:', err)
  }
  cached = {
    ...DEFAULTS,
    ai: { ...DEFAULTS.ai },
    accounts: { ...DEFAULTS.accounts },
    repositories: []
  }
  return cached
}

async function persist(): Promise<void> {
  if (cached === null) return
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(cached, null, 2), 'utf8')
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const s = await load()
  const ids = effectiveClientIds(s)
  return {
    ai: {
      baseUrl: s.ai.baseUrl,
      model: s.ai.model,
      customInstructions: s.ai.customInstructions,
      hasApiKey: (await readApiKey()) !== null
    },
    accounts: {
      hasGitHubClientId: ids.github.length > 0,
      hasGitLabClientId: ids.gitlab.length > 0
    },
    confirmOverrideWithGeneratedMessage: s.confirmOverrideWithGeneratedMessage,
    autoRefresh: s.autoRefresh,
    theme: s.theme,
    hintsEnabled: s.hintsEnabled,
    autoUpdateChecks: s.autoUpdateChecks,
    scanFolder: s.scanFolder
  }
}

/**
 * The client ids actually in force: a Preferences-entered id wins; an empty
 * (or cleared) one falls back to the compiled default.
 */
export async function getAccountsConfig(): Promise<{
  githubClientId: string
  gitlabClientId: string
}> {
  const ids = effectiveClientIds(await load())
  return { githubClientId: ids.github, gitlabClientId: ids.gitlab }
}

function effectiveClientIds(s: StoredSettings): {
  github: string
  gitlab: string
} {
  return {
    github: s.accounts.githubClientId.trim() || DEFAULT_GITHUB_CLIENT_ID,
    gitlab: s.accounts.gitlabClientId.trim() || DEFAULT_GITLAB_CLIENT_ID
  }
}

export async function saveSettings(patch: SettingsPatch): Promise<PublicSettings> {
  const s = await load()
  if (patch.ai !== undefined) {
    if (patch.ai.baseUrl !== undefined) s.ai.baseUrl = normalizeBaseUrl(patch.ai.baseUrl)
    if (patch.ai.model !== undefined) s.ai.model = patch.ai.model.trim()
    if (patch.ai.customInstructions !== undefined) {
      s.ai.customInstructions = patch.ai.customInstructions
    }
    if (patch.ai.apiKey !== undefined) {
      await writeApiKey(patch.ai.apiKey)
    }
  }
  if (patch.accounts !== undefined) {
    if (patch.accounts.githubClientId !== undefined) {
      s.accounts.githubClientId = patch.accounts.githubClientId.trim()
    }
    if (patch.accounts.gitlabClientId !== undefined) {
      s.accounts.gitlabClientId = patch.accounts.gitlabClientId.trim()
    }
  }
  if (patch.confirmOverrideWithGeneratedMessage !== undefined) {
    s.confirmOverrideWithGeneratedMessage =
      patch.confirmOverrideWithGeneratedMessage
  }
  if (patch.autoRefresh !== undefined) s.autoRefresh = patch.autoRefresh
  if (patch.scanFolder !== undefined) {
    const trimmed = patch.scanFolder.trim()
    s.scanFolder = trimmed.length === 0 ? '' : join(trimmed)
  }
  if (patch.hintsEnabled !== undefined) s.hintsEnabled = patch.hintsEnabled
  if (patch.autoUpdateChecks !== undefined) {
    s.autoUpdateChecks = patch.autoUpdateChecks
  }
  if (patch.theme !== undefined && isThemeId(patch.theme)) s.theme = patch.theme
  await persist()
  return getPublicSettings()
}

function normalizeBaseUrl(raw: string): string {
  let url = raw.trim()
  if (url.length === 0) url = DEFAULTS.ai.baseUrl
  url = url.replace(/\/+$/, '')
  return url
}

export async function listRepositories(): Promise<ManagedRepository[]> {
  const s = await load()
  // Repositories whose folder vanished from disk stay in the list, flagged
  // `missing`, so the repository manager can show and clean them up.
  return s.repositories.map(r => ({ ...r, missing: !existsSync(r.path) }))
}

export async function addRepository(path: string): Promise<Repository> {
  const s = await load()
  const normalized = join(path)
  // Re-adding a folder the user had removed from under the watch folder is a
  // deliberate take-back-over: the scan manages it again from here on.
  const key = pathKey(normalized)
  const wasDismissed = s.scanDismissed.some(d => pathKey(d) === key)
  if (wasDismissed) {
    s.scanDismissed = s.scanDismissed.filter(d => pathKey(d) !== key)
  }
  const existing = s.repositories.find(r => r.path === normalized)
  if (existing !== undefined) {
    if (wasDismissed) await persist()
    return existing
  }
  const repo: Repository = {
    id: randomUUID(),
    path: normalized,
    name: basename(normalized)
  }
  s.repositories.push(repo)
  await persist()
  return repo
}

/**
 * Removes all matching entries with a single persist and returns the removed
 * records, so the caller knows their on-disk paths (for Recycle-Bin delete).
 */
export async function removeRepositoriesByIds(
  ids: ReadonlyArray<string>
): Promise<Repository[]> {
  const s = await load()
  const idSet = new Set(ids)
  const removed = s.repositories.filter(r => idSet.has(r.id))
  if (removed.length === 0) return []
  s.repositories = s.repositories.filter(r => !idSet.has(r.id))
  await persist()
  return removed
}

/** The watch folder and the paths the scan must not re-add. */
export async function getScanSettings(): Promise<{
  folder: string
  dismissed: string[]
}> {
  const s = await load()
  return { folder: s.scanFolder, dismissed: [...s.scanDismissed] }
}

/** Remember hand-removals so the next scan pass does not undo them. */
export async function rememberScanDismissals(
  paths: ReadonlyArray<string>
): Promise<void> {
  const s = await load()
  const keys = new Set(s.scanDismissed.map(d => pathKey(d)))
  let changed = false
  for (const p of paths) {
    if (keys.has(pathKey(p))) continue
    s.scanDismissed.push(p)
    keys.add(pathKey(p))
    changed = true
  }
  if (changed) await persist()
}

/** Forget dismissals whose folder left the disk (paths compared by key). */
export async function forgetScanDismissals(
  keys: ReadonlyArray<string>
): Promise<void> {
  const s = await load()
  const drop = new Set(keys)
  const next = s.scanDismissed.filter(d => !drop.has(pathKey(d)))
  if (next.length === s.scanDismissed.length) return
  s.scanDismissed = next
  await persist()
}

export async function getThemeSetting(): Promise<ThemeId> {
  return (await load()).theme
}

export async function isAutoRefreshEnabled(): Promise<boolean> {
  return (await load()).autoRefresh
}

export async function isAutoUpdateChecksEnabled(): Promise<boolean> {
  return (await load()).autoUpdateChecks
}

// ---------------------------------------------------------------------------
// Secrets (never exposed to the renderer)

/**
 * Read a secret sidecar written by {@link writeSecretFile}: decrypted when
 * safeStorage is available, verbatim when it is not. Any unreadable,
 * undecryptable or empty file reads as null so callers treat it as absent.
 */
export async function readSecretFile(path: string): Promise<string | null> {
  try {
    if (!existsSync(path)) return null
    const buf = await readFile(path)
    if (buf.length === 0) return null
    const value = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8')
    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

/** Store a secret; an empty value truncates the file (i.e. clears it). */
export async function writeSecretFile(
  path: string,
  value: string
): Promise<void> {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    await writeFile(path, Buffer.alloc(0), { flag: 'w', mode: 0o600 }).catch(
      () => undefined
    )
    return
  }
  const buf = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(trimmed)
    : Buffer.from(trimmed, 'utf8')
  await mkdir(app.getPath('userData'), { recursive: true })
  // 0600: on systems without a keychain (safeStorage unavailable) the secret
  // is stored verbatim — keep it owner-only on POSIX instead of the umask
  // default.
  await writeFile(path, buf, { mode: 0o600 })
}

export async function readApiKey(): Promise<string | null> {
  return readSecretFile(apiKeyPath())
}

async function writeApiKey(value: string): Promise<void> {
  await writeSecretFile(apiKeyPath(), value)
}

export async function getAiConfig(): Promise<{
  baseUrl: string
  model: string
  customInstructions: string
  apiKey: string | null
}> {
  const s = await load()
  return {
    baseUrl: s.ai.baseUrl,
    model: s.ai.model,
    customInstructions: s.ai.customInstructions,
    apiKey: await readApiKey()
  }
}
