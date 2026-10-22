import { existsSync, watch, type FSWatcher } from 'fs'
import { resolve } from 'path'
import { getMainWindow } from './windows'
import { isAutoRefreshEnabled } from './settings'
import { REPO_CHANGED_CHANNEL } from '../shared/ipc'
import { shouldIgnore } from './watch-filter'

/**
 * Watches a repository's working tree and pushes REPO_CHANGED_CHANNEL to the
 * renderer so the changes list follows edits made in an external editor
 * (GitHub Desktop refreshes status from its file-accessor layer; we keep it
 * simpler: one recursive watcher, debounced, with an ignore list whose
 * decision logic lives in `watch-filter.ts`).
 */

const DEBOUNCE_MS = 300

let watcher: FSWatcher | null = null
let watchedPath: string | null = null
let timer: NodeJS.Timeout | null = null
let lastEmitted = 0

export function startWatching(repoPath: string): void {
  const target = resolve(repoPath)
  if (watchedPath === target && watcher !== null) return
  stopWatching()

  if (!existsSync(target)) return

  try {
    watcher = watch(target, { recursive: true }, (_event, filename) => {
      if (filename === null) {
        schedule(target)
        return
      }
      if (shouldIgnore(target, filename)) return
      schedule(target)
    })
    watcher.on('error', () => {
      // A removed or moved tree kills the watcher; the focus/menu refresh
      // still covers recovery, and re-selecting the repo restarts it.
      stopWatching()
    })
    watchedPath = target
  } catch {
    watcher = null
    watchedPath = null
  }
}

export function stopWatching(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  if (watcher !== null) {
    watcher.close()
    watcher = null
  }
  watchedPath = null
}

export function getWatchedPath(): string | null {
  return watchedPath
}

function schedule(repoPath: string): void {
  if (timer !== null) return
  timer = setTimeout(() => {
    timer = null
    void emit(repoPath)
  }, DEBOUNCE_MS)
}

async function emit(repoPath: string): Promise<void> {
  if (watchedPath === null) return
  if (!(await isAutoRefreshEnabled())) return
  // Collapse bursts that straddle the debounce window — but re-arm instead
  // of dropping, so the last save in a burst still gets a refresh.
  const now = Date.now()
  if (now - lastEmitted < DEBOUNCE_MS) {
    if (watchedPath !== null) schedule(repoPath)
    return
  }
  lastEmitted = now
  getMainWindow()?.webContents.send(REPO_CHANGED_CHANNEL, repoPath)
}
