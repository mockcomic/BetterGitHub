import { watch, type FSWatcher } from 'fs'
import { readdir } from 'fs/promises'
import { join, resolve } from 'path'
import type { RepoScanOutcome, Repository } from '../shared/models'
import { REPOS_CHANGED_CHANNEL } from '../shared/ipc'
import { getMainWindow } from './windows'
import {
  addRepository,
  forgetScanDismissals,
  getScanSettings,
  listRepositories,
  removeRepositoriesByIds
} from './settings'
import { getWatchedPath, stopWatching } from './watcher'
import { pathKey, planScan, type ScannedEntry } from './repo-scan-plan'

/**
 * The repository watch folder: point Aspen at the folder that holds your
 * git repos (e.g. ~/Documents/GitHub) and the repository list follows the
 * folder — a new clone appears, a folder you moved or trashed disappears,
 * without touching repos you added from anywhere else.
 *
 * The reconciliation rules are pure (repo-scan-plan.ts); this module owns
 * the folder watcher, the debounced pass, and the settings mutations.
 */

const DEBOUNCE_MS = 1000

let folderWatcher: FSWatcher | null = null
let timer: NodeJS.Timeout | null = null
let currentScan: Promise<RepoScanOutcome> | null = null
/** Set when an event lands mid-scan, so the pass that follows sees it. */
let rescanQueued = false

const EMPTY: RepoScanOutcome = { added: [], removed: [] }

/** Extra cleanup hooks (ipc.ts aborts in-flight AI runs for dropped repos). */
const removalHooks: Array<(removed: ReadonlyArray<Repository>) => void> = []

export function onScannedRemoval(
  hook: (removed: ReadonlyArray<Repository>) => void
): void {
  removalHooks.push(hook)
}

/**
 * Reconcile the list with the watch folder right now. Concurrent callers
 * share the running pass; an event that lands while it runs queues one
 * follow-up pass so nothing is missed.
 */
export function scanRepositories(): Promise<RepoScanOutcome> {
  if (currentScan !== null) {
    rescanQueued = true
    return currentScan
  }
  currentScan = runPass().finally(() => {
    currentScan = null
    if (rescanQueued) {
      rescanQueued = false
      void scanRepositories()
    }
  })
  return currentScan
}

async function runPass(): Promise<RepoScanOutcome> {
  const { folder, dismissed } = await getScanSettings()
  if (folder.length === 0) return EMPTY
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    // The watch folder itself is gone (unmounted drive, moved); that is not
    // an error — entries simply stay, flagged missing by listRepositories.
    return EMPTY
  }

  const candidates: ScannedEntry[] = []
  for (const name of names) {
    if (name.startsWith('.')) continue
    const p = resolve(join(folder, name))
    try {
      const st = await readdir(p)
      // `.git` as a directory (clone/init) or file (worktree/submodule) —
      // a cheap existence check before any git process runs.
      if (!st.includes('.git')) continue
      candidates.push({ key: pathKey(p), path: p })
    } catch {
      // Unreadable child (permissions, race with a delete); skip it.
    }
  }

  const stored = await listRepositories()
  const plan = planScan({
    folderKey: pathKey(folder),
    candidates,
    stored: stored.map(r => ({ key: pathKey(r.path), path: r.path })),
    dismissed: dismissed.map(d => ({ key: pathKey(d), path: d }))
  })

  const added: Repository[] = []
  for (const path of plan.toAdd) added.push(await addRepository(path))

  const removeIds: string[] = []
  const removeKeys = new Set(plan.toRemove.map(pathKey))
  for (const r of stored) if (removeKeys.has(pathKey(r.path))) removeIds.push(r.id)
  const removed = await removeRepositoriesByIds(removeIds)

  if (plan.toUnDismiss.length > 0) {
    await forgetScanDismissals(plan.toUnDismiss.map(pathKey))
  }

  if (removed.length > 0) {
    // The single-repo watcher dies with its folder; in-flight AI runs are
    // aborted by the hook ipc.ts registers.
    const watched = getWatchedPath()
    if (
      watched !== null &&
      removed.some(r => resolve(r.path) === watched)
    ) {
      stopWatching()
    }
    for (const hook of removalHooks) hook(removed)
  }

  const outcome: RepoScanOutcome = { added, removed }
  if (added.length > 0 || removed.length > 0) {
    getMainWindow()?.webContents.send(REPOS_CHANGED_CHANNEL, outcome)
  }
  return outcome
}

/** Watch the folder for child add/remove; each event debounces into a pass. */
function restartFolderWatcher(): void {
  if (folderWatcher !== null) {
    folderWatcher.close()
    folderWatcher = null
  }
  void getScanSettings().then(({ folder }) => {
    if (folder.length === 0) return
    try {
      const w = watch(folder, { recursive: false }, () => scheduleScan())
      w.on('error', () => {
        // Folder vanished or the watch limit hit — focus/menu refreshes
        // still rescan, so the watcher restarting on the next resync is fine.
        if (folderWatcher === w) folderWatcher = null
        w.close()
      })
      folderWatcher = w
    } catch {
      folderWatcher = null
    }
  })
}

/** Debounced request for a scan pass (fs events, window focus). */
export function scheduleScan(): void {
  if (timer !== null) return
  timer = setTimeout(() => {
    timer = null
    void scanRepositories()
  }, DEBOUNCE_MS)
}

/** Apply the (possibly new) watch-folder setting: re-watch and scan once. */
export async function resyncScanFolder(): Promise<RepoScanOutcome> {
  restartFolderWatcher()
  // Give the watcher promise above a microtask to attach before scanning;
  // the scan itself is what the caller waits for.
  await Promise.resolve()
  return scanRepositories()
}

/** Startup: honor the stored folder, then reconcile once immediately. */
export async function initRepoScan(): Promise<void> {
  restartFolderWatcher()
  await scanRepositories()
}

export function stopRepoScan(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  if (folderWatcher !== null) {
    folderWatcher.close()
    folderWatcher = null
  }
}
