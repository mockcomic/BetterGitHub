import type { FileStatus, FileStatusKind, RepositoryStatus } from '../../shared/models'
import { execGit } from './exec'
import { parsePorcelainStatus, type PorcelainEntry } from './porcelain'

/**
 * Reads repository status using the same git invocation observed in the
 * shipped GitHub Desktop build:
 *   git --no-optional-locks status --branch --porcelain=2 -z --untracked-files=all
 */
export async function getStatus(repoPath: string): Promise<RepositoryStatus> {
  const result = await execGit(
    [
      '--no-optional-locks',
      'status',
      '--branch',
      '--porcelain=2',
      '-z',
      '--untracked-files=all'
    ],
    { cwd: repoPath, successExitCodes: new Set([0, 128]), timeoutMs: 20_000 }
  )

  const { header, entries } = parsePorcelainStatus(result.stdout)

  return {
    branch: header.branch,
    oid: header.oid,
    upstream: header.upstream,
    ahead: header.ahead,
    behind: header.behind,
    detached: header.detached,
    files: entries.map(toFileStatus)
  }
}

export function toFileStatus(entry: PorcelainEntry): FileStatus {
  return {
    path: entry.path,
    oldPath: entry.oldPath,
    indexCode: entry.indexCode,
    worktreeCode: entry.worktreeCode,
    kind: classify(entry),
    staged: !entry.untracked && entry.indexCode !== '.',
    hasWorktreeChanges: entry.untracked || entry.worktreeCode !== '.',
    untracked: entry.untracked
  }
}

function classify(entry: PorcelainEntry): FileStatusKind {
  const x = entry.indexCode
  const y = entry.worktreeCode

  if (entry.untracked) return 'new'
  if (x === 'U' || y === 'U') return 'conflicted'
  if (x === 'R') return 'renamed'
  if (x === 'C') return 'copied'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'A') return 'new'
  if (x === 'T' || y === 'T') return 'type-changed'
  if (x === 'M' || y === 'M') return 'modified'
  return 'modified'
}
