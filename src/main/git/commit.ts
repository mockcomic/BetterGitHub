import { execGit, GitExecError } from './exec'
import { addPaths } from './staging'

/**
 * Commits the staged baseline — everything already in the index — plus the
 * full working-tree content of the files the user ticked, with a
 * summary/description message.
 *
 * Selection is purely additive: `selectedPaths` are `git add`-ed and then a
 * plain `git commit` ships the whole index. That means staged-but-unselected
 * files are always in the commit, and a partially staged file contributes
 * exactly its staged portion (the unstaged remainder survives the commit).
 * Nothing outside `stagedPaths ∪ selectedPaths` can slip in, because a
 * non-empty scope is required up front and the index is precisely that set.
 *
 * Two `-m` flags produce the classic
 *   summary
 *   <blank line>
 *   description
 * layout, matching the model GitHub Desktop's commit box produces.
 */
export async function commitPaths(
  repoPath: string,
  summary: string,
  description: string,
  selectedPaths: ReadonlyArray<string>,
  stagedPaths: ReadonlyArray<string> = []
): Promise<string> {
  const trimmed = summary.trim()
  if (trimmed.length === 0) {
    throw new Error('A commit summary is required.')
  }
  if (selectedPaths.length === 0 && stagedPaths.length === 0) {
    throw new Error('Nothing to commit — stage some files or tick at least one.')
  }

  // Make sure every ticked file is present in the index (add covers
  // deletions and new files). Paths already fully staged (including
  // deletions) are skipped by addPaths rather than failing the add; a
  // staged-and-modified file gets its whole content staged because the
  // user explicitly selected it.
  await addPaths(repoPath, selectedPaths)

  const args = ['commit', '-m', trimmed]
  const body = description.trim()
  if (body.length > 0) args.push('-m', body)

  try {
    await execGit(args, { cwd: repoPath, timeoutMs: 30_000 })
  } catch (err) {
    // The renderer's staged list can be stale (another app moved the index
    // while the box was open): turn git's empty-index refusal into the same
    // guidance an empty scope gets.
    if (
      err instanceof GitExecError &&
      /no changes added to commit|nothing added to commit|nothing to commit/i.test(
        err.result.stderr
      )
    ) {
      throw new Error('Nothing to commit — stage some files or tick at least one.')
    }
    throw err
  }

  return (await execGit(['rev-parse', 'HEAD'], { cwd: repoPath, timeoutMs: 10_000 }))
    .stdout.trim()
}

/**
 * Rewrites the tip commit with a new message (and the given paths), the
 * "Edit latest commit" flow. Uses the same `--only` semantics as a commit so
 * checking files still scopes what the amendment includes.
 */
export async function amendCommit(
  repoPath: string,
  summary: string,
  description: string,
  paths: ReadonlyArray<string>,
  expectedSha?: string
): Promise<string> {
  const trimmed = summary.trim()
  if (trimmed.length === 0) {
    throw new Error('A commit summary is required.')
  }
  const head = await revParseHead(repoPath)
  if (head.length === 0) {
    throw new Error('This repository has no commits yet.')
  }
  // Same tip-moved guard as undo: never amend somebody else's commit when a
  // pull/watcher moved the tip while the amend box was open.
  if (expectedSha !== undefined && expectedSha.length > 0 && !sameSha(head, expectedSha)) {
    throw new Error(
      'The latest commit has changed since the amend started, so the amendment was cancelled.'
    )
  }

  if (paths.length > 0) {
    await addPaths(repoPath, paths)
  }

  const args = ['commit', '--amend', '--only', '-m', trimmed]
  const body = description.trim()
  if (body.length > 0) args.push('-m', body)
  if (paths.length > 0) args.push('--end-of-options', ...paths)

  await execGit(args, { cwd: repoPath, timeoutMs: 30_000 })

  return (await execGit(['rev-parse', 'HEAD'], { cwd: repoPath, timeoutMs: 10_000 }))
    .stdout.trim()
}

/**
 * GitHub Desktop's "Undo": move HEAD back one commit while keeping the
 * changes staged, so the commit box can be refilled. Refuses when the tip is
 * no longer the commit we just created (someone else committed/pulled).
 */
export async function undoLastCommit(
  repoPath: string,
  expectedSha: string
): Promise<string> {
  const head = await revParseHead(repoPath)
  if (head.length === 0) {
    throw new Error('This repository has no commits to undo.')
  }
  if (expectedSha.length > 0 && !sameSha(head, expectedSha)) {
    throw new Error(
      'The latest commit has changed since it was created, so it can no longer be undone.'
    )
  }

  const parents = await execGit(
    ['rev-list', '--max-count=2', 'HEAD'],
    { cwd: repoPath, timeoutMs: 10_000 }
  ).catch(() => null)
  const hasParent =
    parents !== null && parents.stdout.split(/\s+/).filter(l => l.length > 0).length > 1
  if (!hasParent) {
    throw new Error(
      'This is the first commit in the repository; it cannot be undone.'
    )
  }

  await execGit(['reset', '--quiet', '--soft', 'HEAD^'], {
    cwd: repoPath,
    timeoutMs: 30_000
  })
  return head
}

/** `git revert --no-edit <sha>` (merge commits need -m and are refused). */
export async function revertCommit(
  repoPath: string,
  sha: string
): Promise<void> {
  const parents = await execGit(['rev-list', '--parents', '-n', '1', sha], {
    cwd: repoPath,
    timeoutMs: 15_000
  })
  const parentCount = parents.stdout.trim().split(/\s+/).filter(l => l.length > 0).length - 1
  if (parentCount > 1) {
    throw new Error(
      'Reverting a merge commit is not supported yet — pick one of its parent commits instead.'
    )
  }
  await execGit(['revert', '--no-edit', '--end-of-options', sha], {
    cwd: repoPath,
    timeoutMs: 60_000
  })
}

/** `git cherry-pick <sha>`. Callers check for a clean tree first. */
export async function cherryPickCommit(
  repoPath: string,
  sha: string
): Promise<void> {
  await execGit(['cherry-pick', '--end-of-options', sha], {
    cwd: repoPath,
    timeoutMs: 60_000
  })
}

async function revParseHead(repoPath: string): Promise<string> {
  try {
    const result = await execGit(['rev-parse', '--verify', 'HEAD'], {
      cwd: repoPath,
      timeoutMs: 10_000
    })
    return result.stdout.trim()
  } catch (err) {
    if (err instanceof GitExecError) return ''
    throw err
  }
}


/** Compares two SHAs tolerating an abbreviated expected value. */
function sameSha(head: string, expected: string): boolean {
  const a = head.toLowerCase()
  const b = expected.toLowerCase()
  return a === b || a.startsWith(b) || b.startsWith(a)
}
