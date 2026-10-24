import type { BranchInfo, BranchList } from '../../shared/models'
import { execGit, GitExecError } from './exec'
import { getStatus } from './status'

/** Local branches plus remote-tracking branches (origin/foo…). */
export async function getBranches(repoPath: string): Promise<BranchList> {
  const [forEachRef, remoteRef, status] = await Promise.all([
    execGit(
      [
        'for-each-ref',
        '--format=%(refname:short)\t%(objectname)',
        'refs/heads/'
      ],
      { cwd: repoPath, timeoutMs: 15_000 }
    ),
    execGit(
      [
        'for-each-ref',
        '--format=%(refname:short)\t%(objectname)',
        'refs/remotes/'
      ],
      { cwd: repoPath, timeoutMs: 15_000 }
    ),
    getStatus(repoPath)
  ])

  const local = parseRefs(forEachRef.stdout).map(b => ({
    ...b,
    current: b.name === status.branch
  }))

  const remote = parseRefs(remoteRef.stdout)
    // `origin/HEAD -> origin/main` is a pointer, not a branch you can check out.
    .filter(b => !b.name.endsWith('/HEAD') && !b.name.includes(' -> '))
    .map(b => {
      const slash = b.name.indexOf('/')
      return {
        name: b.name.slice(slash + 1),
        head: b.head,
        current: false,
        remote: b.name.slice(0, slash)
      }
    })
    .filter(b => b.remote.length > 0 && b.name.length > 0)

  sortBranches(local)
  sortBranches(remote)

  return { local, remote }
}

function parseRefs(output: string): BranchInfo[] {
  return output
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(line => {
      const [name, head] = line.split('\t')
      return { name: name ?? '', head: head ?? '', current: false }
    })
    .filter(b => b.name.length > 0)
}

function sortBranches(branches: BranchInfo[]): void {
  branches.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Checks out a branch. `fromRemote` creates a local branch tracking that
 * remote branch (git's DWIM only applies to a bare `checkout <name>`).
 */
export async function checkoutBranch(
  repoPath: string,
  name: string,
  fromRemote?: string
): Promise<void> {
  if (fromRemote !== undefined && fromRemote.length > 0) {
    const ref = `${fromRemote}/${name}`
    try {
      await execGit(['checkout', '-B', name, '--track', ref], {
        cwd: repoPath,
        timeoutMs: 30_000
      })
      return
    } catch (err) {
      // Older git or a missing ref: fall back to the DWIM checkout, which
      // creates the tracking branch itself when exactly one remote has it.
      // Only substitute the fallback's error when it also fails, so real
      // failures (dirty tree would be overwritten, …) keep their own message.
      if (!(err instanceof GitExecError)) throw err
      try {
        await execGit(['checkout', name], { cwd: repoPath, timeoutMs: 30_000 })
        return
      } catch {
        throw err
      }
    }
  }
  // Branch names can never start with '-' (git's check-ref-format), and
  // `git checkout` does not recognize `--end-of-options` on git <= 2.43
  // (it treats it as a pathspec and fails), so use the plain form.
  await execGit(['checkout', name], {
    cwd: repoPath,
    timeoutMs: 30_000
  })
}

/**
 * Merges `name` (or `${fromRemote}/${name}` when a remote is given) into the
 * checked-out branch. Git itself decides fast-forward vs merge commit — the
 * same semantics as `pull` — and `--no-edit` uses the prepared merge message
 * without an interactive editor (execGit also pins `GIT_EDITOR=:`).
 *
 * A merge that stops on conflicts exits non-zero while leaving the worktree
 * mid-merge; that is the paused-merge workflow the conflicts view already
 * knows how to continue or abort, so the error (carrying git's CONFLICT
 * lines) simply travels to the renderer.
 */
export async function mergeBranch(
  repoPath: string,
  name: string,
  fromRemote?: string
): Promise<string> {
  const status = await getStatus(repoPath)
  if (status.detached || status.branch === '(detached)') {
    throw new Error(
      'Cannot merge while on a detached HEAD — check out a branch first.'
    )
  }
  const { merge, rebase, cherryPick, revert } = status.inProgress
  if (merge || rebase || cherryPick || revert) {
    throw new Error(
      'Finish or abort the current merge/rebase before starting another.'
    )
  }
  if (status.files.length > 0) {
    throw new Error('Commit or stash your local changes before merging.')
  }
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('Pick a branch to merge first.')
  }
  const ref =
    fromRemote !== undefined && fromRemote.length > 0
      ? `${fromRemote}/${trimmed}`
      : trimmed
  if (ref === status.branch) {
    throw new Error(`"${trimmed}" is already the branch you are on.`)
  }
  // `--` after the options: branch names cannot start with '-' (git's
  // check-ref-format), but keep the separator so a remote name like a path
  // can never be parsed as another option. git merge treats the trailing
  // positionals as revisions to merge (proven by the integration suite).
  try {
    const r = await execGit(['merge', '--no-edit', '--', ref], {
      cwd: repoPath,
      timeoutMs: 120_000
    })
    return (r.stdout + r.stderr).trim()
  } catch (err) {
    // A conflicted merge exits 1 while leaving MERGE_HEAD behind, and
    // GitExecError only carries git's first stderr line ("Auto-merging
    // …"), which hides the CONFLICT lines. Detect the paused merge from the
    // repo itself and rethrow with the full output, so the renderer can
    // explain the state instead of toasting a truncated error.
    if (err instanceof GitExecError && err.result.exitCode === 1) {
      const after = await getStatus(repoPath)
      if (after.inProgress.merge) {
        throw new Error(
          `Merge conflict — "${ref}" needs conflict resolution:\n` +
            (err.result.stdout + err.result.stderr).trim()
        )
      }
    }
    throw err
  }
}

export async function createBranch(
  repoPath: string,
  name: string,
  startPoint?: string
): Promise<void> {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('Branch name cannot be empty.')
  }
  const args = ['checkout', '-b', trimmed]
  const base = startPoint?.trim()
  // No `--end-of-options` before the start point: `git checkout -b` does not
  // recognize it on git <= 2.43 (it becomes a pathspec and aborts with
  // "Cannot update paths and switch to branch"); `--` has the same failure.
  // The plain form is what git's own docs prescribe for `branch startPoint`.
  if (base !== undefined && base.length > 0) args.push(base)
  await execGit(args, { cwd: repoPath, timeoutMs: 20_000 })
}

/**
 * Deletes a local branch. Without `force`, git's own unmerged safety check
 * applies (`-d`); the renderer surfaces that error and offers a forced retry.
 */
export async function deleteBranch(
  repoPath: string,
  name: string,
  force: boolean
): Promise<void> {
  const status = await getStatus(repoPath)
  if (status.branch === name) {
    throw new Error(`Switch to another branch before deleting "${name}".`)
  }
  await execGit(['branch', force ? '-D' : '-d', '--', name], {
    cwd: repoPath,
    timeoutMs: 20_000
  })
}

export async function renameBranch(
  repoPath: string,
  oldName: string,
  newName: string
): Promise<void> {
  const trimmed = newName.trim()
  if (trimmed.length === 0) {
    throw new Error('Branch name cannot be empty.')
  }
  if (trimmed === oldName) return
  await execGit(['branch', '-m', '--', oldName, trimmed], {
    cwd: repoPath,
    timeoutMs: 20_000
  })
}

export async function deleteRemoteBranch(
  repoPath: string,
  remote: string,
  name: string
): Promise<void> {
  await execGit(
    ['push', remote, '--delete', name],
    { cwd: repoPath, timeoutMs: 120_000 }
  )
}
