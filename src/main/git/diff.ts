import { readFile } from 'fs/promises'
import { execGit, GitExecError } from './exec'
import { safeJoin } from './repo-path'

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
  // `--` (not `--end-of-options`) is the portable rev/pathspec separator for
  // git <= 2.43; with it, paths absent from the working tree still diff
  // correctly instead of erroring out into the synthesized-added fallback.
  const args = ['diff', '--no-ext-diff', 'HEAD', '-U3', '--']
  if (oldPath !== undefined) args.push(oldPath)
  args.push(path)

  let stdout = ''
  try {
    stdout = (
      await execGit(args, {
        cwd: repoPath,
        timeoutMs: 30_000,
        successExitCodes: new Set([0, 1])
      })
    ).stdout
  } catch (err) {
    // git aborts with exit 128 when the path is absent from the index/working
    // tree (deleted since the caller's status snapshot, or ignored). Fall
    // through to the synthesized diff below instead of failing the payload.
    if (!(err instanceof GitExecError)) throw err
    stdout = ''
  }

  if (stdout.trim().length > 0) {
    return stdout
  }

  // Likely untracked: synthesize an added-file diff from file contents.
  // The read goes through safeJoin — the path arrives from the renderer, and
  // `..` segments must not turn this into an arbitrary file read outside the
  // repository. A path that escapes (or vanished) simply yields no diff.
  try {
    const content = await readFile(safeJoin(repoPath, path))
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
    ['diff', '--no-ext-diff', base, sha, '-U3', '--', path],
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
 * The subset of `paths` that currently exists in the index. `git diff HEAD --
 * <paths>` aborts the whole command (exit 128, "no such path in the working
 * tree") on a single path the index does not know, so callers must know which
 * paths are safe to hand to the batched command.
 */
async function filterIndexedPaths(
  repoPath: string,
  paths: ReadonlyArray<string>
): Promise<Set<string>> {
  if (paths.length === 0) return new Set()
  const result = await execGit(
    ['ls-files', '-z', '--end-of-options', ...paths],
    { cwd: repoPath, timeoutMs: 10_000 }
  )
  return new Set(result.stdout.split('\0').filter(p => p.length > 0))
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

  const candidates: string[] = []
  const synthesized: string[] = []
  for (const p of paths) {
    if (statusByPath.get(p)?.untracked === true) synthesized.push(p)
    else candidates.push(p)
  }

  // Files deleted (or newly ignored) after the caller captured its status are
  // checked in the sidebar but absent from the index; batching them kills the
  // whole diff, so route them through the per-path fallback which tolerates a
  // missing file. This also covers the race where a file vanishes between the
  // index probe and the batched command.
  const indexed = await filterIndexedPaths(repoPath, candidates)
  const tracked = candidates.filter(p => indexed.has(p))
  const stale = candidates.filter(p => !indexed.has(p))

  const parts: string[] = []
  if (tracked.length > 0) {
    try {
      const r = await execGit(
        ['diff', '--no-ext-diff', 'HEAD', '-U3', '--end-of-options', ...tracked],
        { cwd: repoPath, timeoutMs: 30_000, successExitCodes: new Set([0, 1]) }
      )
      parts.push(r.stdout)
    } catch (err) {
      if (!(err instanceof GitExecError)) throw err
      for (const p of tracked) parts.push(await getPathDiff(repoPath, p))
    }
  }
  for (const p of stale) {
    parts.push(await getPathDiff(repoPath, p))
  }
  for (const p of synthesized) {
    parts.push(await getPathDiff(repoPath, p))
  }

  return parts.join('')
}
