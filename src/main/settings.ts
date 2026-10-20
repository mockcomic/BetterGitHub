import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { app, safeStorage } from 'electron'
import type {
  ManagedRepository,
  PublicSettings,
  Repository,
  SettingsPatch
} from '../shared/models'

/**
 * JSON settings + repository list in userData, and an API key kept in an
 * encrypted sidecar file when the OS supports it (GitHub Desktop used
 * keytar; we use Electron safeStorage).
 */

interface StoredSettings {
  repositories: Repository[]
  ai: { baseUrl: string; model: string; customInstructions: string }
  confirmOverrideWithGeneratedMessage: boolean
  autoRefresh: boolean
  theme: 'system' | 'light' | 'dark'
}

const DEFAULTS: StoredSettings = {
  repositories: [],
  ai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    customInstructions: ''
  },
  confirmOverrideWithGeneratedMessage: true,
  autoRefresh: true,
  theme: 'system'
}

let cached: StoredSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'gitdesk-settings.json')
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
        repositories: Array.isArray(parsed.repositories)
          ? parsed.repositories
          : []
      }
      return cached
    }
  } catch (err) {
    console.error('Failed to read settings, using defaults:', err)
  }
  cached = { ...DEFAULTS, ai: { ...DEFAULTS.ai }, repositories: [] }
  return cached
}

async function persist(): Promise<void> {
  if (cached === null) return
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(cached, null, 2), 'utf8')
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const s = await load()
  return {
    ai: {
      baseUrl: s.ai.baseUrl,
      model: s.ai.model,
      customInstructions: s.ai.customInstructions,
      hasApiKey: (await readApiKey()) !== null
    },
    confirmOverrideWithGeneratedMessage: s.confirmOverrideWithGeneratedMessage,
    autoRefresh: s.autoRefresh,
    theme: s.theme
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
  if (patch.confirmOverrideWithGeneratedMessage !== undefined) {
    s.confirmOverrideWithGeneratedMessage =
      patch.confirmOverrideWithGeneratedMessage
  }
  if (patch.autoRefresh !== undefined) s.autoRefresh = patch.autoRefresh
  if (patch.theme !== undefined) s.theme = patch.theme
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
  const existing = s.repositories.find(r => r.path === normalized)
  if (existing !== undefined) return existing
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

export async function getThemeSetting(): Promise<'system' | 'light' | 'dark'> {
  return (await load()).theme
}

export async function isAutoRefreshEnabled(): Promise<boolean> {
  return (await load()).autoRefresh
}

// ---------------------------------------------------------------------------
// API key (never exposed to the renderer)

export async function readApiKey(): Promise<string | null> {
  try {
    if (!existsSync(apiKeyPath())) return null
    const buf = await readFile(apiKeyPath())
    if (buf.length === 0) return null
    const value = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8')
    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

async function writeApiKey(value: string): Promise<void> {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    await writeFile(apiKeyPath(), Buffer.alloc(0), { flag: 'w' }).catch(
      () => undefined
    )
    return
  }
  const buf = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(trimmed)
    : Buffer.from(trimmed, 'utf8')
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(apiKeyPath(), buf)
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
