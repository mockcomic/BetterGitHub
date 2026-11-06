import { app } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateCheckResult, UpdateState } from '../shared/updates'
import {
  LATEST_RELEASE_URL,
  RELEASES_API_URL,
  RELEASES_URL,
  UPDATE_REPO_NAME,
  UPDATE_REPO_OWNER,
  isVersionNewer,
  parseReleaseJson
} from '../shared/updates'
import { UPDATE_STATE_CHANNEL } from '../shared/ipc'
import { getMainWindow } from './windows'
import { apiFetch, providerErrorMessage } from './providers/http'
import { getAccountToken, listAccounts } from './accounts'
import { isAutoUpdateChecksEnabled } from './settings'

/**
 * Self-update against this repository's GitHub Releases.
 *
 * Two tiers, one UI:
 *
 * - *Full updater* — packaged win32 builds installed through the NSIS
 *   installer: electron-updater reads `latest.yml` from the GitHub release,
 *   and — once the user approves the prompt — downloads the new installer
 *   and applies it via `quitAndInstall()`. Nothing is ever fetched without
 *   that approval. electron-builder already emits `latest.yml` +
 *   blockmap next to the Setup exe; a release must carry all three.
 * - *Releases-page check* — every other run (dev, macOS, Linux, the Windows
 *   portable exe): a plain `GET releases/latest` through the same HTTP
 *   helper the account browser uses, semver-compared locally. The app can
 *   tell the user a newer version exists and hand them the release page;
 *   applying the update stays manual (mac self-update additionally needs
 *   signed+notarized builds we don't produce yet).
 *
 * The renderer learns about every phase through the UPDATE_STATE_CHANNEL
 * push (same one-window pattern as watcher.ts); the manual IPC call returns
 * a one-shot result so "Check for updates…" can always report a verdict.
 */

/** Seconds after window creation the silent startup check waits to run —
 *  long enough that first-paint and repo loading never share bandwidth
 *  with a download. */
const STARTUP_CHECK_DELAY_MS = 8_000

let wired = false
let lastPhase: UpdateState['phase'] | null = null
let lastPercent = -1
let lastBroadcast: UpdateState | null = null

/** Whether this exact run can download-and-apply an update itself. */
export function canSelfUpdate(): boolean {
  return (
    app.isPackaged &&
    process.platform === 'win32' &&
    // The portable target runs straight from its extracted temp folder —
    // there is no installation to update in place.
    process.env['PORTABLE_EXECUTABLE_DIR'] === undefined
  )
}

function broadcast(state: Omit<UpdateState, 'canInstall' | 'releaseUrl'> & {
  releaseUrl?: string
}): void {
  const full: UpdateState = {
    ...state,
    canInstall: canSelfUpdate(),
    releaseUrl: state.releaseUrl ?? LATEST_RELEASE_URL
  }
  lastPhase = full.phase
  lastBroadcast = full
  getMainWindow()?.webContents.send(UPDATE_STATE_CHANNEL, full)
}

/** electron-updater's notes are string | Note[] | null depending on release
 *  shape; the About section only ever wants plain markdown. */
function normalizeNotes(notes: UpdateInfo['releaseNotes']): string | undefined {
  if (typeof notes === 'string') return notes.length > 0 ? notes : undefined
  if (Array.isArray(notes)) {
    const texts = notes
      .map(n => (typeof n === 'object' && n !== null ? n.note : undefined))
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
    if (texts.length > 0) return texts.join('\n\n')
  }
  return undefined
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Wire electron-updater's event stream into the push channel (full mode
 *  only — the page-only tier is driven request-by-request). */
function wireUpdaterEvents(): void {
  if (wired) return
  wired = true
  autoUpdater.logger = null
  // Never fetch bytes without the user saying yes: the renderer prompts on
  // 'available' and calls the downloadUpdate IPC to start the transfer.
  autoUpdater.autoDownload = false
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: UPDATE_REPO_OWNER,
    repo: UPDATE_REPO_NAME
  })
  autoUpdater.on('checking-for-update', () => {
    lastPhase = 'checking'
    broadcast({ phase: 'checking' })
  })
  autoUpdater.on('update-available', info => {
    broadcast({ phase: 'available', version: String(info.version) })
  })
  autoUpdater.on('update-not-available', () => {
    broadcast({ phase: 'up-to-date' })
  })
  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    const percent = Math.max(0, Math.min(100, Math.round(p.percent)))
    // Progress ticks fire per network chunk; only forward whole-percent moves.
    if (percent === lastPercent && lastPhase === 'downloading') return
    lastPercent = percent
    broadcast({ phase: 'downloading', version: lastBroadcast?.version, percent })
  })
  autoUpdater.on('update-downloaded', info => {
    broadcast({ phase: 'ready', version: String(info.version) })
  })
  autoUpdater.on('error', err => {
    // A failed background pass must never nag — the store only surfaces
    // 'error' pushes inside the About dialog; manual checks answer through
    // the checkForUpdates result instead.
    broadcast({ phase: 'error', version: lastBroadcast?.version, error: messageOf(err) })
  })
}

/**
 * Best-effort Bearer for the Releases API: the first signed-in github.com
 * account, when one exists. Raises the rate ceiling from the anonymous
 * 60 req/h and keeps working if the repo ever goes private.
 */
async function githubApiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': `aspen/${app.getVersion()}`
  }
  try {
    const accounts = await listAccounts()
    const account = accounts.find(
      a => a.provider === 'github' && a.apiBase === 'https://api.github.com'
    )
    if (account !== undefined) {
      const token = await getAccountToken(account)
      if (token !== null) headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // Account store trouble must not sink the update check — anonymous is fine.
  }
  return headers
}

/** The page-only tier: GitHub's Releases API, parsed and compared locally. */
async function checkViaReleasesApi(currentVersion: string): Promise<UpdateCheckResult> {
  const base: Pick<UpdateCheckResult, 'currentVersion' | 'releaseSeen' | 'releaseUrl'> = {
    currentVersion,
    releaseSeen: false,
    releaseUrl: RELEASES_URL
  }
  let res: Awaited<ReturnType<typeof apiFetch>>
  try {
    res = await apiFetch(RELEASES_API_URL, { headers: await githubApiHeaders() })
  } catch (err) {
    const result: UpdateCheckResult = {
      ...base,
      status: 'error',
      error: messageOf(err)
    }
    broadcast({ phase: 'error', error: result.error, releaseUrl: RELEASES_URL })
    return result
  }
  if (res.status === 404) {
    const result: UpdateCheckResult = {
      ...base,
      status: 'error',
      error: 'Aspen has no published releases yet, so there is nothing to update to.'
    }
    broadcast({ phase: 'error', error: result.error, releaseUrl: RELEASES_URL })
    return result
  }
  if (!res.ok) {
    const result: UpdateCheckResult = {
      ...base,
      status: 'error',
      error: providerErrorMessage('GitHub', res)
    }
    broadcast({ phase: 'error', error: result.error, releaseUrl: RELEASES_URL })
    return result
  }
  const release = parseReleaseJson(res.json)
  if (release === null) {
    const result: UpdateCheckResult = {
      ...base,
      status: 'error',
      error: 'GitHub returned a release payload Aspen could not read.',
      releaseSeen: true
    }
    broadcast({ phase: 'error', error: result.error, releaseUrl: RELEASES_URL })
    return result
  }
  if (!isVersionNewer(currentVersion, release.version)) {
    broadcast({ phase: 'up-to-date', releaseUrl: release.url })
    return { ...base, status: 'up-to-date', releaseSeen: true, releaseUrl: release.url }
  }
  broadcast({
    phase: 'available',
    version: release.version,
    releaseUrl: release.url
  })
  return {
    ...base,
    status: 'available',
    releaseSeen: true,
    version: release.version,
    releaseUrl: release.url,
    notes: release.notes.length > 0 ? release.notes : undefined
  }
}

/**
 * One update check, whichever tier this run belongs to. `manual` currently
 * only documents the call site (the renderer decides what to show); the
 * silent startup pass uses the exact same path.
 */
export async function checkForUpdates(manual: boolean): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  broadcast({ phase: 'checking' })
  if (canSelfUpdate()) {
    try {
      const res = await autoUpdater.checkForUpdates()
      if (res === null) {
        return {
          status: 'error',
          currentVersion,
          releaseSeen: false,
          releaseUrl: RELEASES_URL,
          error: 'The updater is not active in this run.'
        }
      }
      if (!res.isUpdateAvailable) {
        return {
          status: 'up-to-date',
          currentVersion,
          releaseSeen: true,
          releaseUrl: LATEST_RELEASE_URL
        }
      }
      return {
        status: 'available',
        currentVersion,
        releaseSeen: true,
        version: String(res.updateInfo.version),
        releaseUrl: LATEST_RELEASE_URL,
        notes: normalizeNotes(res.updateInfo.releaseNotes)
      }
    } catch (err) {
      // The 'error' event already pushed the phase; answer too so manual
      // callers get a verdict (a manual call is the only reason to await).
      return {
        status: 'error',
        currentVersion,
        releaseSeen: false,
        releaseUrl: RELEASES_URL,
        error: messageOf(err)
      }
    }
  }
  void manual
  return checkViaReleasesApi(currentVersion)
}

/** Start the approved download (full mode). The renderer only calls this
 *  after the user accepts the "update available" prompt; the download's
 *  progress and the 'ready' verdict arrive back on UPDATE_STATE_CHANNEL.
 *  Idempotent: a second call while a download is in flight is a no-op. */
export function downloadApprovedUpdate(): void {
  if (!canSelfUpdate()) {
    throw new Error(
      'This build cannot self-update — download the installer from the releases page.'
    )
  }
  if (lastBroadcast?.phase === 'downloading' || lastBroadcast?.phase === 'ready') return
  void autoUpdater.downloadUpdate().catch(err => {
    // downloadUpdate rejects after the 'error' event already pushed the
    // phase; the catch keeps the rejection from surfacing as unhandled.
    broadcast({ phase: 'error', version: lastBroadcast?.version, error: messageOf(err) })
  })
}

/** Apply the downloaded update (full mode). Throws a page-link verdict for
 *  everything else so the generic IPC error toast is still actionable. */
export function quitAndInstallUpdate(): void {
  if (!canSelfUpdate()) {
    throw new Error(
      'This build cannot self-update — download the installer from the releases page.'
    )
  }
  if (lastBroadcast?.phase !== 'ready') {
    throw new Error('No update is downloaded yet — run "Check for updates…" first.')
  }
  // Silent install, always relaunch: quitAndInstall closes the windows and
  // fires before-quit (terminal cleanup included) before handing off.
  autoUpdater.quitAndInstall(false, true)
}

/** Configure the full updater and schedule the silent first check. Call
 *  once from whenReady, after registerIpc/createMainWindow. */
export function initUpdates(): void {
  if (canSelfUpdate()) {
    // Import + configuration is all this does; nothing hits the network
    // until the scheduled (or manual) check runs.
    wireUpdaterEvents()
  }
  if (!app.isPackaged) return
  void isAutoUpdateChecksEnabled()
    .then(enabled => {
      if (!enabled) return
      setTimeout(() => {
        void checkForUpdates(false).catch(() => undefined)
      }, STARTUP_CHECK_DELAY_MS)
    })
    .catch(() => undefined)
}
