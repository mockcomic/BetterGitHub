import { rm } from 'fs/promises'
import { join } from 'path'
import { execGit, GitExecError } from './exec'
import { getStatus } from './status'

/** `git add` the given paths (including deletions). */
export async function stagePaths(
  repoPath: string,
  paths: ReadonlyArray<string>
): Promise<void> {
  if (paths.length === 0) return
  await execGit(['add', '-A', '--end-of-options', ...paths], {
    cwd: repoPath,
    timeoutMs: 20_000
  })
}

/** Unstage the given paths (worktree content is preserved). */
export async function unstagePaths(
  repoPath: string,
  paths: ReadonlyArray<string>
): Promise<void> {
  if (paths.length === 0) return
  await execGit(['reset', '-q', '--end-of-options', ...paths], {
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
        await execGit(['reset', '-q', '--end-of-options', ...tracked], {
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
    await execGit(['reset', '-q', '--end-of-options', p], {
      cwd: repoPath,
      timeoutMs: 20_000
    }).catch(() => undefined)
    await rm(join(repoPath, ...p.split('/')), { force: true, recursive: false })
  }
}
