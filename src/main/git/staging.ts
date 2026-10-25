import { existsSync } from 'fs'
import { rm } from 'fs/promises'
import { join } from 'path'
import { execGit, GitExecError } from './exec'
import { safeJoin } from './repo-path'
import { getStatus } from './status'

/** `fatal: pathspec 'foo' did not match any files` — git aborted the whole add. */
const STALE_PATHSPEC = /pathspec '(.+)' did not match any files/g
const IGNORED_HEADER = 'The following paths are ignored by one of your .gitignore files:'

/**
 * Extract from a failed `git add` the requested paths git refused, so the
 * caller can drop them and retry. Recognises the two refusals that must not
 * fail the stage: a stale pathspec (quoted verbatim) and gitignored paths
 * (listed per line after the header; for a directory pathspec git lists the
 * *files* inside it, so a listed file also drops its containing request).
 * Anything unrecognised returns empty and the original error propagates.
 * Relies on LC_ALL=C forcing English messages.
 */
function refusedPaths(stderr: string, remaining: ReadonlyArray<string>): string[] {
  const refused = new Set<string>()
  for (const m of stderr.matchAll(STALE_PATHSPEC)) {
    if (remaining.includes(m[1])) refused.add(m[1])
  }
  const lines = stderr.split(/\r?\n/)
  const header = lines.indexOf(IGNORED_HEADER)
  if (header >= 0) {
    const listed: string[] = []
    for (let i = header + 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.length === 0 || line.startsWith('hint:')) break
      listed.push(line)
    }
    for (const p of remaining) {
      if (listed.includes(p) || listed.some(l => l.startsWith(`${p}/`))) refused.add(p)
    }
  }
  return [...refused]
}

/**
 * `git add` the given paths, self-healing on stale ones.
 *
 * Layer 1 — a cheap pre-filter drops paths matching neither the working tree
 * nor the index (a deletion already fully staged), which would otherwise make
 * `git add` abort the *entire* command with "fatal: pathspec … did not match
 * any files".
 *
 * Layer 2 — the add itself runs in a retry loop: anything that vanishes
 * between the check and the add, or that git still refuses by name (e.g. a
 * file newly covered by .gitignore), is dropped from the list and the add is
 * re-run. Each retry sheds at least one path, so the loop terminates; only a
 * refusal git says nothing about (lock file, permissions) reaches the caller.
 */
export async function addPaths(
  repoPath: string,
  paths: ReadonlyArray<string>
): Promise<void> {
  if (paths.length === 0) return
  const inIndex = new Set(
    (
      await execGit(['ls-files', '--end-of-options', ...paths], {
        cwd: repoPath,
        timeoutMs: 10_000
      })
    )
      .stdout.split('\n')
      .map(line => line.replace(/\r$/, ''))
      .filter(line => line.length > 0)
  )
  let remaining = paths.filter(
    p => inIndex.has(p) || existsSync(join(repoPath, ...p.split('/')))
  )
  while (remaining.length > 0) {
    try {
      await execGit(['add', '-A', '--end-of-options', ...remaining], {
        cwd: repoPath,
        timeoutMs: 20_000,
        env: { LC_ALL: 'C' }
      })
      return
    } catch (err) {
      if (!(err instanceof GitExecError)) throw err
      const refused = refusedPaths(err.result.stderr, remaining)
      if (refused.length === 0) throw err
      remaining = remaining.filter(p => !refused.includes(p))
    }
  }
}

/** `git add` the given paths (including deletions). */
export async function stagePaths(
  repoPath: string,
  paths: ReadonlyArray<string>
): Promise<void> {
  await addPaths(repoPath, paths)
}
/** Unstage the given paths (worktree content is preserved). */
export async function unstagePaths(
  repoPath: string,
  paths: ReadonlyArray<string>
): Promise<void> {
  if (paths.length === 0) return
  // `git reset` rejects `--end-of-options` after it sees positional args on
  // git <= 2.43 (exit 128); `--` is the portable separator.
  await execGit(['reset', '-q', '--', ...paths], {
    cwd: repoPath,
    timeoutMs: 20_000
  })
}

/**
 * Discard changes for the given paths: reset to HEAD for tracked files,
 * delete for untracked files.
 */
export async function discardPaths(
  repoPath: string,
  paths: ReadonlyArray<string>
): Promise<void> {
  if (paths.length === 0) return

  const status = await getStatus(repoPath)
  const byPath = new Map(status.files.map(f => [f.path, f]))

  const tracked: string[] = []
  const removed: string[] = []

  for (const p of paths) {
    const entry = byPath.get(p)
    if (entry === undefined) continue
    if (entry.untracked || (entry.indexCode === 'A' && entry.worktreeCode === '.')) {
      removed.push(p)
    } else {
      tracked.push(p)
      if (entry.oldPath !== undefined) tracked.push(entry.oldPath)
    }
  }

  if (tracked.length > 0) {
    await execGit(
      [
        'restore',
        '--source=HEAD',
        '--staged',
        '--worktree',
        '--end-of-options',
        ...tracked
      ],
      { cwd: repoPath, timeoutMs: 30_000 }
    ).catch(async (err: unknown) => {
      // Files not present in HEAD (newly staged) can't be restored; fall
      // back to unstage + delete for those.
      if (err instanceof GitExecError) {
        await execGit(['reset', '-q', '--', ...tracked], {
          cwd: repoPath,
          timeoutMs: 20_000
        })
        removed.push(...tracked)
      } else {
        throw err
      }
    })
  }

  for (const p of removed) {
    await execGit(['reset', '-q', '--', p], {
      cwd: repoPath,
      timeoutMs: 20_000
    }).catch(() => undefined)
    // safeJoin: this is a *delete* driven by renderer-supplied paths; a
    // `..`-laden path must never rm outside the repository.
    await rm(safeJoin(repoPath, p), { force: true, recursive: false })
  }
}

/**
 * Resolves one conflicted path: pick the incoming ("theirs") or current
 * ("ours") side, then stage it so git considers it resolved. `resolved` only
 * stages the working-tree content as-is.
 */
export async function resolveConflict(
  repoPath: string,
  path: string,
  side: 'ours' | 'theirs' | 'resolved'
): Promise<void> {
  if (side === 'ours' || side === 'theirs') {
    await execGit(
      ['checkout', `--${side}`, '--', path],
      { cwd: repoPath, timeoutMs: 20_000 }
    )
  }
  await execGit(['add', '-A', '--end-of-options', path], {
    cwd: repoPath,
    timeoutMs: 20_000
  })
}
