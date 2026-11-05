import { spawn } from 'child_process'
import { readFile, stat } from 'fs/promises'
import { safeJoin } from './repo-path'

/**
 * Raw bytes of a repository path — the working-tree file, or the blob in a
 * commit's tree. Media and model previews are the only consumers: execGit
 * decodes stdout as UTF-8, which destroys binary payloads, so reads go through
 * a pipe straight into a Buffer instead.
 */

export interface FileBytes {
  /** Size on disk / in the object store, known even when the bytes were refused. */
  readonly byteLength: number
  /** Null when the file exceeds `sizeLimit` — the caller says so instead of hanging. */
  readonly bytes: Buffer | null
}

/**
 * Bytes of `path`, or null when it cannot be read (missing file, a path with
 * `..` segments, a commit that does not contain it, a directory).
 */
export async function readRepoFileBytes(
  repoPath: string,
  path: string,
  sha: string | undefined,
  sizeLimit: number
): Promise<FileBytes | null> {
  if (sha === undefined) {
    try {
      // safeJoin also answers the containment question.
      const file = safeJoin(repoPath, path)
      const info = await stat(file)
      if (!info.isFile()) return null
      if (info.size > sizeLimit) return { byteLength: info.size, bytes: null }
      return { byteLength: info.size, bytes: await readFile(file) }
    } catch {
      return null
    }
  }
  // Read the blob straight out of the object store — byte-exact regardless of
  // checkout state, working-tree filters or line endings. `cat-file -s` is the
  // cheap size probe so oversized files are refused without being streamed
  // through the pipe.
  const size = await gitCatFileSize(repoPath, sha, path)
  if (size === null) return null
  if (size > sizeLimit) return { byteLength: size, bytes: null }
  const bytes = await gitCatFileBlob(repoPath, sha, path)
  return bytes === null ? null : { byteLength: size, bytes }
}

/**
 * Minimal raw-output git runner: read-only plumbing, so no sandbox rerun is
 * needed (see src/main/git/sandbox.ts for why writes get one).
 */
function runGitRaw(
  repoPath: string,
  args: ReadonlyArray<string>
): Promise<{ status: number; stdout: Buffer; stderr: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => out.push(d))
    child.stderr.on('data', (d: Buffer) => err.push(d))
    child.on('error', reject)
    child.on('close', status => {
      resolve({ status: status ?? -1, stdout: Buffer.concat(out), stderr: Buffer.concat(err) })
    })
  })
}

function objectName(sha: string, path: string): string {
  return `${sha}:${path}`
}

async function gitCatFileSize(
  repoPath: string,
  sha: string,
  path: string
): Promise<number | null> {
  try {
    const r = await runGitRaw(repoPath, ['cat-file', '-s', objectName(sha, path)])
    if (r.status !== 0) return null
    const size = Number.parseInt(r.stdout.toString('utf8').trim(), 10)
    return Number.isFinite(size) && size >= 0 ? size : null
  } catch {
    return null
  }
}

async function gitCatFileBlob(
  repoPath: string,
  sha: string,
  path: string
): Promise<Buffer | null> {
  try {
    const r = await runGitRaw(repoPath, ['cat-file', 'blob', objectName(sha, path)])
    return r.status === 0 ? r.stdout : null
  } catch {
    return null
  }
}
