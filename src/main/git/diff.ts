import { readFile } from 'fs/promises'
import { join } from 'path'
import { execGit, GitExecError } from './exec'

/**
 * Diff helpers. Working-tree diffs are expressed as `<path> vs HEAD` so a
 * single git invocation covers staged and unstaged changes alike; untracked
 * files get a synthesized +diff (git cannot diff them against HEAD).
 */
export async function getPathDiff(
  repoPath: string,
  path: string,
  oldPath?: string
): Promise<string> {
  const args = ['diff', '--no-ext-diff', 'HEAD', '-U3', '--end-of-options']
  if (oldPath !== undefined) args.push(oldPath)
  args.push(path)

  const result = await execGit(args, {
    cwd: repoPath,
    timeoutMs: 30_000,
    successExitCodes: new Set([0, 1])
  })

  if (result.stdout.trim().length > 0) {
    return result.stdout
  }

  // Likely untracked: synthesize an added-file diff from file contents.
  try {
    const content = await readFile(join(repoPath, ...path.split('/')))
    const text = content.toString('utf8')
    if (text.includes('\u0000')) {
      return `diff --git a/${path} b/${path}\nBinary files a/${path} and b/${path} differ\n`
    }
    const lines = text.split(/\r?\n/)
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    const body = lines.map(l => `+${l}`).join('\n')
    return `diff --git a/${path} b/${path}\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${body}\n`
  } catch {
    return ''
  }
}

/** Raw unified diff for one file within a commit (vs its first parent). */
export async function getCommitFileDiff(
  repoPath: string,
  sha: string,
  path: string
): Promise<string> {
  const base = await commitBase(repoPath, sha)
  const result = await execGit(
    ['diff', '--no-ext-diff', base, sha, '-U3', '--end-of-options', path],
    { cwd: repoPath, timeoutMs: 30_000 }
  )
  return result.stdout
}

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** First parent of a commit, or the empty tree for root commits. */
export async function commitBase(repoPath: string, sha: string): Promise<string> {
  try {
    const out = await execGit(['rev-parse', '--verify', '--quiet', `${sha}^`], {
      cwd: repoPath,
      timeoutMs: 10_000
    })
    const parent = out.stdout.trim()
    return parent.length > 0 ? parent : EMPTY_TREE
  } catch (err) {
    if (err instanceof GitExecError) return EMPTY_TREE
    throw err
  }
}

/** Name-status listing of files changed by a commit (first-parent). */
export async function getCommitFileNames(
  repoPath: string,
  sha: string
): Promise<ReadonlyArray<{ path: string; oldPath?: string; code: string }>> {
  const base = await commitBase(repoPath, sha)
  const result = await execGit(
    ['diff', '--no-ext-diff', '--name-status', '-z', base, sha],
    { cwd: repoPath, timeoutMs: 30_000 }
  )
  return parseNameStatusZ(result.stdout)
}

/**
 * Parse `git diff --name-status -z` output. In the -z format there are no
 * tabs: the status token and each path are separate NUL-terminated records,
 * and renames/copies put the old path in the record right after the new one
 * (e.g. `R100\0new\0old\0M\0other\0`).
 */
export function parseNameStatusZ(
  output: string
): Array<{ path: string; oldPath?: string; code: string }> {
  const records = output.split('\0').filter(r => r.length > 0)
  const files: Array<{ path: string; oldPath?: string; code: string }> = []

  let i = 0
  while (i < records.length) {
    const code = records[i]
    const path = records[i + 1]
    if (path === undefined) break
    i += 2
    const kind = code[0]
    if ((kind === 'R' || kind === 'C') && records[i] !== undefined) {
      files.push({ path, oldPath: records[i], code })
      i++
    } else {
      files.push({ path, code })
    }
  }

  return files
}

/**
 * Combined diff text (vs HEAD) for a set of paths — this is the payload
 * handed to the AI commit-message agent, wrapped in a trust boundary there.
 */
export async function getPathsDiffText(
  repoPath: string,
  paths: ReadonlyArray<string>,
  statusByPath: ReadonlyMap<string, { untracked: boolean; oldPath?: string }>
): Promise<string> {
  if (paths.length === 0) return ''

  const tracked: string[] = []
  const untracked: string[] = []
  for (const p of paths) {
    if (statusByPath.get(p)?.untracked === true) untracked.push(p)
    else tracked.push(p)
  }

  const parts: string[] = []
  if (tracked.length > 0) {
    const r = await execGit(
      ['diff', '--no-ext-diff', 'HEAD', '-U3', '--end-of-options', ...tracked],
      { cwd: repoPath, timeoutMs: 30_000, successExitCodes: new Set([0, 1]) }
    )
    parts.push(r.stdout)
  }
  for (const p of untracked) {
    parts.push(await getPathDiff(repoPath, p))
  }

  return parts.join('')
}
