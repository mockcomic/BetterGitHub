import type { WorkflowKind } from '../../shared/models'
import { execGit } from './exec'
import { getStatus } from './status'

/**
 * Finishes a paused operation. execGit sets `GIT_EDITOR=:`, so git commits the
 * message it already prepared instead of blocking on an editor.
 *
 * `merge --continue` takes no other arguments (git 2.55 rejects `--no-edit`
 * there with "fatal: --continue expects no arguments"), while the sequencer
 * commands cherry-pick/revert do accept it — verified against the binary.
 */
export async function continueOperation(
  repoPath: string,
  kind: WorkflowKind
): Promise<void> {
  const status = await getStatus(repoPath)
  if (status.conflictCount > 0) {
    throw new Error(
      `Resolve all ${status.conflictCount} conflicted file${
        status.conflictCount === 1 ? '' : 's'
      } first.`
    )
  }

  switch (kind) {
    case 'merge':
      await execGit(['merge', '--continue'], {
        cwd: repoPath,
        timeoutMs: 60_000
      })
      return
    case 'rebase':
      await execGit(['rebase', '--continue'], {
        cwd: repoPath,
        timeoutMs: 120_000
      })
      return
    case 'cherryPick':
      await execGit(['cherry-pick', '--continue', '--no-edit'], {
        cwd: repoPath,
        timeoutMs: 60_000
      })
      return
    case 'revert':
      await execGit(['revert', '--continue', '--no-edit'], {
        cwd: repoPath,
        timeoutMs: 60_000
      })
      return
  }
}

/** Aborts a paused operation, restoring the pre-operation state. */
export async function abortOperation(
  repoPath: string,
  kind: WorkflowKind
): Promise<void> {
  switch (kind) {
    case 'merge':
      await execGit(['merge', '--abort'], { cwd: repoPath, timeoutMs: 60_000 })
      return
    case 'rebase':
      await execGit(['rebase', '--abort'], { cwd: repoPath, timeoutMs: 120_000 })
      return
    case 'cherryPick':
      await execGit(['cherry-pick', '--abort'], {
        cwd: repoPath,
        timeoutMs: 60_000
      })
      return
    case 'revert':
      await execGit(['revert', '--abort'], { cwd: repoPath, timeoutMs: 60_000 })
      return
  }
}

/** The single operation currently paused, if any (null when the tree is idle). */
export async function activeWorkflow(
  repoPath: string
): Promise<WorkflowKind | null> {
  const { inProgress } = await getStatus(repoPath)
  if (inProgress.rebase) return 'rebase'
  if (inProgress.merge) return 'merge'
  if (inProgress.revert) return 'revert'
  if (inProgress.cherryPick) return 'cherryPick'
  return null
}
