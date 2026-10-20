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
  const args = ['diff', 'HEAD', '-U3', '--end-of-options']
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
    ['diff', base, sha, '-U3', '--end-of-options', path],
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
    ['diff', '--name-status', '-z', base, sha],
    { cwd: repoPath, timeoutMs: 30_000 }
  )

  const records = result.stdout.split('\0')
  const files: Array<{ path: string; oldPath?: string; code: string }> = []

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record.length === 0) continue
    const space = record.indexOf('\t')
    if (space === -1) continue
    const code = record.slice(0, space)
    const path = record.slice(space + 1)
    const kind = code[0]
    if (kind === 'R' || kind === 'C') {
      const oldPath = records[i + 1]
      if (oldPath !== undefined) i++
      files.push({ path, oldPath, code })
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
      ['diff', 'HEAD', '-U3', '--end-of-options', ...tracked],
      { cwd: repoPath, timeoutMs: 30_000, successExitCodes: new Set([0, 1]) }
    )
    parts.push(r.stdout)
  }
  for (const p of untracked) {
    parts.push(await getPathDiff(repoPath, p))
  }

  return parts.join('')
}
