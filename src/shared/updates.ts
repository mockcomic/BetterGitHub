/**
 * The self-update contract shared by main (src/main/updates.ts) and the
 * renderer (store + About dialog), plus the pure parsing/comparison helpers
 * the GitHub Releases check runs on. Electron-free on purpose: tests import
 * this module directly (tests/updates.test.ts).
 */

/** The owner/repo whose Releases page feeds the updater. */
export const UPDATE_REPO_OWNER = 'mockcomic'
export const UPDATE_REPO_NAME = 'BetterGitHub'

/** Where every "get the update" affordance sends the user. */
export const RELEASES_URL = `https://github.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases`
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`
export const RELEASES_API_URL = `https://api.github.com/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/latest`

/**
 * Where the update flow stands. 'unsupported' is the page-only verdict:
 * the app could not self-apply an update (dev run, portable exe, mac/linux
 * build) but the releases page answer was still fetched — or could not be
 * fetched at all — and `error` carries the human-readable reason.
 */
export type UpdatePhase =
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error'

/** Main -> renderer push (UPDATE_STATE_CHANNEL) on every phase change. */
export interface UpdateState {
  readonly phase: UpdatePhase
  /** The newer version, once known. */
  readonly version?: string
  /** 0–100 while phase === 'downloading'. */
  readonly percent?: number
  /** Human-readable failure reason for phase === 'error'. */
  readonly error?: string
  /**
   * True when this build can self-apply the update (packaged win32 NSIS):
   * the UI offers "Restart to update" instead of "Open releases page".
   */
  readonly canInstall: boolean
  /** Always set — the escape hatch when in-app install is impossible. */
  readonly releaseUrl: string
}

/** The resolved value of the manual `checkForUpdates` IPC call. */
export interface UpdateCheckResult {
  readonly status: 'up-to-date' | 'available' | 'error'
  readonly currentVersion: string
  readonly version?: string
  /** False when no release could be read at all (offline, 404, …). */
  readonly releaseSeen: boolean
  readonly releaseUrl: string
  /** Release notes body for 'available' (markdown, renderer never renders it raw-critical). */
  readonly notes?: string
  readonly error?: string
}

/** 'v0.2.0' / '0.2.0' → { major, minor, patch } on a valid core; null otherwise. */
export function parseVersionCore(
  raw: string
): { major: number; minor: number; patch: number } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(raw.trim())
  if (match === null) return null
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
    return null
  }
  return { major, minor, patch }
}

/**
 * True only when `candidate` names a strictly newer stable core than
 * `current`. Unparseable inputs are never "newer" — a malformed tag must
 * not push a download at the user. A prerelease/build suffix on an equal
 * core (0.1.0-beta.1 vs 0.1.0) is not newer either.
 */
export function isVersionNewer(current: string, candidate: string): boolean {
  const a = parseVersionCore(current)
  const b = parseVersionCore(candidate)
  if (a === null || b === null) return false
  if (b.major !== a.major) return b.major > a.major
  if (b.minor !== a.minor) return b.minor > a.minor
  return b.patch > a.patch
}

/** A trimmed GitHub release JSON reduced to what the UI needs; null if unusable. */
export interface ReleaseInfo {
  /** The tag without its leading 'v', as versions are shown elsewhere. */
  readonly version: string
  /** The release's own page (preferred over the generic releases list). */
  readonly url: string
  /** Markdown body; empty string when the release has no notes. */
  readonly notes: string
}

export function parseReleaseJson(json: Record<string, unknown>): ReleaseInfo | null {
  const tag = json.tag_name
  const url = json.html_url
  if (typeof tag !== 'string' || typeof url !== 'string') return null
  const core = parseVersionCore(tag)
  if (core === null) return null
  const body = json.body
  return {
    version: `${core.major}.${core.minor}.${core.patch}`,
    url: url.trim().length > 0 ? url : LATEST_RELEASE_URL,
    notes: typeof body === 'string' ? body : ''
  }
}
