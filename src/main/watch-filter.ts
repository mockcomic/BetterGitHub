import { sep } from 'path'

/**
 * Pure decision logic for the repository file watcher: which paths under a
 * watched tree are worth a status refresh. Split out of `watcher.ts` so it can
 * be unit-tested without Electron.
 */

/** Path fragments never worth a refresh (noise and VCS bookkeeping). */
export const IGNORED_SEGMENTS: ReadonlyArray<string> = [
  `${sep}.git${sep}logs${sep}`,
  `${sep}.git${sep}objects${sep}`,
  `${sep}node_modules${sep}`
]

/** Git bookkeeping files whose change *does* matter (HEAD moved, index…). */
export const SIGNIFICANT_GIT_FILES: ReadonlySet<string> = new Set([
  'HEAD',
  'index',
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'ORIG_HEAD'
])

export function shouldIgnore(_repoPath: string, relativePath: string): boolean {
  const normalized = relativePath.replace(/\//g, sep)
  const withSeparators = `${sep}${normalized}${sep}`

  for (const ignored of IGNORED_SEGMENTS) {
    if (withSeparators.includes(ignored)) return true
  }

  const gitPrefix = `.git${sep}`
  if (!normalized.startsWith(gitPrefix)) return false

  // Inside .git only a handful of bookkeeping paths matter.
  const base = normalized.slice(gitPrefix.length)
  const topLevel = base.split(sep).pop() ?? ''
  if (SIGNIFICANT_GIT_FILES.has(topLevel)) return false
  if (base.startsWith(`refs${sep}`)) return false
  if (base === 'rebase-merge' || base.startsWith(`rebase-merge${sep}`)) return false
  if (base === 'rebase-apply' || base.startsWith(`rebase-apply${sep}`)) return false
  return true
}
