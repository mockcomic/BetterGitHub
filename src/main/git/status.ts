import { existsSync } from 'fs'
import type {
  FileStatus,
  FileStatusKind,
  RepositoryStatus,
  WorkflowState
} from '../../shared/models'
import { execGit } from './exec'
import { parsePorcelainStatus, type PorcelainEntry } from './porcelain'

/**
 * Reads repository status using the same git invocation observed in the
 * shipped GitHub Desktop build:
 *   git --no-optional-locks status --branch --porcelain=2 -z --untracked-files=all
 *
 * On top of that it detects paused operations (merge / rebase / cherry-pick /
 * revert) by probing the git directory, which porcelain v2 does not report.
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

  // Exit 128 is tolerated only for the benign "empty/unborn" cases; a real
  // fatal (corrupt index, unreadable HEAD) with no stdout must surface.
  if (result.exitCode === 128 && result.stdout.trim().length === 0 && result.stderr.trim().length > 0) {
    throw new Error(result.stderr.trim().split(/\r?\n/)[0])
  }

  const { header, entries } = parsePorcelainStatus(result.stdout)
  const files = entries.map(toFileStatus)
  const conflictCount = files.filter(f => f.kind === 'conflicted').length

  return {
    branch: header.branch,
    oid: header.oid,
    upstream: header.upstream,
    ahead: header.ahead,
    behind: header.behind,
    detached: header.detached,
    files,
    conflictCount,
    inProgress: await detectInProgress(repoPath)
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
  // The unmerged marker (porcelain `u` record) outranks the letters: AA/DD
  // would otherwise classify as new/deleted and hide the conflict.
  if (entry.unmerged === true || x === 'U' || y === 'U') return 'conflicted'
  if (x === 'R') return 'renamed'
  if (x === 'C') return 'copied'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'A') return 'new'
  if (x === 'T' || y === 'T') return 'type-changed'
  if (x === 'M' || y === 'M') return 'modified'
  return 'modified'
}

/**
 * Pure: which operations are paused, given the set of git-directory entries
 * that exist. Exported for tests.
 */
export function detectWorkflows(present: ReadonlySet<string>): WorkflowState {
  const rebase =
    present.has('rebase-merge') || present.has('rebase-apply')
  return {
    merge: present.has('MERGE_HEAD'),
    rebase,
    // A revert is a cherry-pick under the hood; REVERT_HEAD tells them apart.
    revert: present.has('REVERT_HEAD'),
    cherryPick: present.has('CHERRY_PICK_HEAD') && !present.has('REVERT_HEAD')
  }
}

async function detectInProgress(repoPath: string): Promise<WorkflowState> {
  const gitDir = await resolveGitDir(repoPath)
  const present = new Set<string>()
  for (const probe of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-merge',
    'rebase-apply'
  ]) {
    if (existsSync(`${gitDir}/${probe}`)) present.add(probe)
  }
  return detectWorkflows(present)
}

/**
 * `--absolute-git-dir` handles linked worktrees and submodules, where
 * `<repo>/.git` is a file rather than a directory.
 */
async function resolveGitDir(repoPath: string): Promise<string> {
  try {
    const result = await execGit(['rev-parse', '--absolute-git-dir'], {
      cwd: repoPath,
      timeoutMs: 10_000
    })
    const dir = result.stdout.trim()
    if (dir.length > 0) return dir.replace(/\\/g, '/').replace(/\/+$/, '')
  } catch {
    /* fall through to the default location */
  }
  return `${repoPath.replace(/\\/g, '/').replace(/\/+$/, '')}/.git`
}
