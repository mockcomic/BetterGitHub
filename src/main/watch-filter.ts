/**
 * Pure decision logic for the repository file watcher: which paths under a
 * watched tree are worth a status refresh. Split out of `watcher.ts` so it can
 * be unit-tested without Electron.
 */

/**
 * Ignored-fragments and matching are done on FORWARD-SLASH-normalized paths:
 * incoming paths mix separators (git porcelain emits `/`, the watcher emits
 * native `\` on Windows), and baking the list with the native `sep` missed
 * the other spelling (the bug that let `.git\logs\HEAD` through on POSIX
 * and would let `node_modules/` through on Windows).
 */
export const IGNORED_SEGMENTS: ReadonlyArray<string> = [
  '/.git/logs/',
  '/.git/objects/',
  '/node_modules/'
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
  // Normalize BOTH separators to '/', platform-independent.
  const normalized = relativePath.replace(/[\\/]/g, '/')
  const withSeparators = `/${normalized}/`

  for (const ignored of IGNORED_SEGMENTS) {
    if (withSeparators.includes(ignored)) return true
  }

  const gitPrefix = `.git/`
  if (!normalized.startsWith(gitPrefix)) return false

  // Inside .git only a handful of bookkeeping paths matter.
  const base = normalized.slice(gitPrefix.length)
  const topLevel = base.split('/').pop() ?? ''
  if (SIGNIFICANT_GIT_FILES.has(topLevel)) return false
  if (base.startsWith('refs/')) return false
  if (base === 'rebase-merge' || base.startsWith('rebase-merge/')) return false
  if (base === 'rebase-apply' || base.startsWith('rebase-apply/')) return false
  return true
}
