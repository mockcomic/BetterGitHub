import { execGit } from './exec'

/**
 * Commits exactly the given paths with a summary/description message.
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
  paths: ReadonlyArray<string>
): Promise<string> {
  const trimmed = summary.trim()
  if (trimmed.length === 0) {
    throw new Error('A commit summary is required.')
  }
  if (paths.length === 0) {
    throw new Error('Select at least one file to commit.')
  }

  // Make sure everything selected is present in the index (add covers
  // deletions and new files; `commit --only` below still restricts the
  // commit to the selected paths).
  await execGit(['add', '-A', '--end-of-options', ...paths], {
    cwd: repoPath,
    timeoutMs: 30_000
  })

  const args = ['commit', '--only', '-m', trimmed]
  const body = description.trim()
  if (body.length > 0) args.push('-m', body)
  args.push('--end-of-options', ...paths)

  await execGit(args, { cwd: repoPath, timeoutMs: 30_000 })

  return (await execGit(['rev-parse', 'HEAD'], { cwd: repoPath, timeoutMs: 10_000 }))
    .stdout.trim()
}
