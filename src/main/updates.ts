import { app } from 'electron'
import { statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { UpdateCheckResult, UpdateState } from '../shared/updates'
import {
  chooseAsset,
  LATEST_RELEASE_URL,
  RELEASES_URL,
  type SanitizedAsset,
  type SanitizedRelease
} from '../shared/updates'
import { UPDATE_STATE_CHANNEL } from '../shared/ipc'
import { getMainWindow } from './windows'
import { getAccountToken, listAccounts } from './accounts'
import { isAutoUpdateChecksEnabled } from './settings'
import {
  check,
  configure,
  download,
  runInstaller,
  snapshot,
  type CheckOutcome
} from './update-core'

/**
 * Self-update against this repository's GitHub Releases — the Nucleus
 * doctrine (there: src/main/update.js), engine in src/main/update-core.ts.
 *
 * One flow for every run: a Releases API check, a yes/no prompt on
 * 'available', and only ON THE YES the published installer streams to the
 * Downloads folder, sha256-verified against the release's signed
 * update-manifest.json, then spawned detached while Aspen quits. Nothing is
 * ever fetched without approval, and a release whose manifest does not
 * verify is browse-only — the releases page, never a download (fail closed,
 * no unsigned fallback).
 *
 * The only per-run difference is `canSelfUpdate`: dev builds and non-win32
 * runs get the releases-page verdict instead of the download flow (the NSIS
 * installer applies to Windows installs; mac self-update additionally needs
 * signed+notarized builds we don't produce yet).
 *
 * The renderer learns about every phase through the UPDATE_STATE_CHANNEL
 * push (same one-window pattern as watcher.ts); the manual IPC call returns
 * a one-shot result so "Check for updates…" can always report a verdict.
 */

/** Seconds after window creation the silent startup check waits to run —
 *  long enough that first-paint and repo loading never share bandwidth
 *  with a download. */
const STARTUP_CHECK_DELAY_MS = 8_000

/** Whether this exact run can download-and-run an installer itself. The
 *  portable target runs straight from its extracted temp folder — there is
 *  no installation to update in place — so it is page-only like the others. */
export function canSelfUpdate(): boolean {
  return (
    app.isPackaged &&
    process.platform === 'win32' &&
    process.env['PORTABLE_EXECUTABLE_DIR'] === undefined
  )
}

let lastPercent = -1
let lastBroadcast: UpdateState | null = null
/** The asset the current 'available' verdict points at, once chosen — the
 *  only thing a download-approved call may fetch. */
let offeredAsset: SanitizedAsset | null = null

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** mtime of the running app's install directory: the "when was THIS build
 *  made" clock the same-version new-build rule compares the release's
 *  published_at against. NaN when unreadable — the rule then answers
 *  'up-to-date' rather than claim anything. */
function appBuildMs(): number {
  try {
    return statSync(dirname(app.getPath('exe'))).mtimeMs
  } catch {
    return NaN
  }
}

function broadcast(state: Omit<UpdateState, 'canInstall' | 'releaseUrl'> & {
  releaseUrl?: string
}): void {
  const full: UpdateState = {
    ...state,
    canInstall: canSelfUpdate(),
    releaseUrl: state.releaseUrl ?? LATEST_RELEASE_URL
  }
  lastBroadcast = full
  getMainWindow()?.webContents.send(UPDATE_STATE_CHANNEL, full)
}

/** Turn a release + verdict into the 'available' push and remember what a
 *  later approval should download. */
function offerRelease(release: SanitizedRelease, kind: 'version' | 'build'): void {
  offeredAsset = chooseAsset(release, process.env['PORTABLE_EXECUTABLE_DIR'] !== undefined)
  broadcast({
    phase: 'available',
    version: release.versionLabel,
    kind,
    authenticated: release.authenticated === true,
    authReason: release.authReason ?? null,
    releaseUrl: release.url
  })
}

/** The one-shot result shape the manual IPC call answers with, folded from
 *  a core outcome + current state. */
function resultFrom(
  outcome: CheckOutcome,
  currentVersion: string,
  release: SanitizedRelease | null
): UpdateCheckResult {
  const base: Pick<UpdateCheckResult, 'currentVersion' | 'releaseSeen' | 'releaseUrl'> = {
    currentVersion,
    releaseSeen: release !== null,
    releaseUrl: release !== null ? release.url : RELEASES_URL
  }
  if (outcome.status === 'error') {
    return { ...base, status: 'error', error: outcome.error ?? 'The update check failed.' }
  }
  if (outcome.status === 'available') {
    return {
      ...base,
      status: 'available',
      version: release?.versionLabel,
      kind: outcome.kind,
      authenticated: release?.authenticated === true,
      authReason: release?.authReason ?? null
    }
  }
  if (outcome.status === 'up-to-date') return { ...base, status: 'up-to-date' }
  // 'none': GitHub answered but had nothing usable to offer — report as
  // up-to-date rather than an error the user cannot act on.
  return { ...base, status: 'up-to-date' }
}

/**
 * Best-effort Bearer for the Releases API: the first signed-in github.com
 * account, when one exists. Raises the rate ceiling from the anonymous
 * 60 req/h and keeps working if the repo ever goes private.
 */
async function githubApiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
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

/**
 * One update check, whichever surface asked for it. `manual` decides what
 * an empty answer looks like: a silent pass says nothing, a manual call
 * must always report a verdict.
 */
export async function checkForUpdates(manual: boolean): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  broadcast({ phase: 'checking' })
  let headers: Record<string, string> = {}
  try {
    headers = await githubApiHeaders()
  } catch (err) {
    // Never expected (the helper swallows internally); answer with a verdict.
    const error = messageOf(err)
    broadcast({ phase: 'error', error })
    return { status: 'error', currentVersion, releaseSeen: false, releaseUrl: RELEASES_URL, error }
  }
  const outcome = await check({
    appVersion: currentVersion,
    appPublishMs: appBuildMs(),
    headers
  })
  const snap = snapshot(currentVersion, appBuildMs())
  if (outcome.status === 'error') {
    broadcast({ phase: 'error', error: outcome.error ?? 'The update check failed.' })
    return resultFrom(outcome, currentVersion, snap.release)
  }
  if (snap.verdict.status === 'available' && snap.release !== null) {
    offerRelease(snap.release, snap.verdict.kind)
    return resultFrom(outcome, currentVersion, snap.release)
  }
  offeredAsset = null
  if (snap.verdict.status === 'up-to-date') {
    broadcast({ phase: 'up-to-date', releaseUrl: snap.release?.url ?? RELEASES_URL })
    return {
      status: 'up-to-date',
      currentVersion,
      releaseSeen: snap.release !== null,
      releaseUrl: snap.release?.url ?? RELEASES_URL
    }
  }
  // 'none' — GitHub answered but there is nothing usable. A manual call
  // still has to say something; a silent pass stays quiet (no push).
  const error = snap.error
    ?? 'Aspen has no published releases yet, so there is nothing to update to.'
  if (manual) broadcast({ phase: 'error', error })
  return { status: 'error', currentVersion, releaseSeen: false, releaseUrl: RELEASES_URL, error }
}

/** Where the installer download lands. `app.getPath('downloads')` resolves
 *  the Windows well-known Downloads folder (and its equivalent elsewhere). */
function downloadsDir(): string {
  return app.getPath('downloads')
}

let downloading = false

/** Start the approved download (the renderer only calls this after the user
 *  accepts the "update available" prompt). Progress and the 'ready' verdict
 *  arrive back on UPDATE_STATE_CHANNEL. Idempotent while a download runs. */
export async function downloadApprovedUpdate(): Promise<void> {
  if (!canSelfUpdate()) {
    throw new Error(
      'This build cannot self-update — download the installer from the releases page.'
    )
  }
  if (downloading || lastBroadcast?.phase === 'ready') return
  const snap = snapshot(app.getVersion(), appBuildMs())
  const release = snap.release
  if (release === null || offeredAsset === null) {
    throw new Error('No update is available — run "Check for updates…" first.')
  }
  if (release.authenticated !== true) {
    // Fail closed: an unauthenticated release never touches the network.
    throw new Error(
      release.authReason
        ? `That update is not authenticated (${release.authReason}) — open the releases page instead.`
        : 'That update is not authenticated — open the releases page instead.'
    )
  }
  downloading = true
  broadcast({ phase: 'downloading', version: release.versionLabel })
  try {
    const res = await download({
      asset: offeredAsset,
      authenticated: release.authenticated,
      destDir: downloadsDir(),
      tag: release.tag,
      onProgress: p => {
        const percent = p.pct === null ? undefined : p.pct
        // Progress ticks fire per network chunk; only forward whole-percent moves.
        if (percent === undefined || percent === lastPercent) return
        lastPercent = percent
        broadcast({ phase: 'downloading', version: release.versionLabel, percent })
      }
    })
    if (!res.ok) throw new Error(res.error)
    broadcast({
      phase: 'ready',
      version: release.versionLabel,
      installerPath: res.path,
      releaseUrl: release.url
    })
  } finally {
    downloading = false
  }
}

/** Hand off to the verified installer and quit. Throws a page-link verdict
 *  for everything else so the generic IPC error toast is still actionable. */
export function quitAndInstallUpdate(): void {
  if (!canSelfUpdate()) {
    throw new Error(
      'This build cannot self-update — download the installer from the releases page.'
    )
  }
  if (downloading || lastBroadcast?.phase !== 'ready' || !lastBroadcast.installerPath) {
    throw new Error('No update is downloaded yet — run "Check for updates…" first.')
  }
  const res = runInstaller(lastBroadcast.installerPath)
  if (!res.ok) throw new Error(res.error)
  // The installer runs detached; quit so it can replace the running files.
  // app.quit runs the before-quit cleanup (terminal teardown included) first.
  app.quit()
}

/** Point the cache at userData and schedule the silent startup check. Call
 *  once from whenReady, after registerIpc/createMainWindow. */
export function initUpdates(): void {
  configure(app.isPackaged ? app.getPath('userData') : null)
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
