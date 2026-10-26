import { spawn } from 'child_process'
import { readFile, stat } from 'fs/promises'
import type { FilePreview, PreviewKind } from '../../shared/models'
import { safeJoin } from './repo-path'

/**
 * Media previews for the diff pane. Git reports image/video/audio changes as
 * binary, so the text diff has nothing to show; this module reads the actual
 * bytes — from the working tree, or from a commit's tree when a sha is given —
 * so the renderer can wrap them in a blob URL and play them.
 */

/**
 * Above this size a preview is refused: a blob URL that large would sit in
 * renderer memory doing nothing for the vast majority of formats people
 * actually commit (raw footage aside). The panel explains and offers Open.
 */
export const PREVIEW_SIZE_LIMIT = 128 * 1024 * 1024

const MEDIA_TYPES: ReadonlyMap<string, { kind: PreviewKind; mime: string }> = new Map([
  // images
  ['png', { kind: 'image', mime: 'image/png' }],
  ['jpg', { kind: 'image', mime: 'image/jpeg' }],
  ['jpeg', { kind: 'image', mime: 'image/jpeg' }],
  ['gif', { kind: 'image', mime: 'image/gif' }],
  ['webp', { kind: 'image', mime: 'image/webp' }],
  ['avif', { kind: 'image', mime: 'image/avif' }],
  ['bmp', { kind: 'image', mime: 'image/bmp' }],
  ['ico', { kind: 'image', mime: 'image/x-icon' }],
  ['tif', { kind: 'image', mime: 'image/tiff' }],
  ['tiff', { kind: 'image', mime: 'image/tiff' }],
  ['svg', { kind: 'image', mime: 'image/svg+xml' }],
  // video (Chromium plays the ones whose codecs it ships; the panel falls
  // back to a "can't play here, Open instead" note for the rest)
  ['mp4', { kind: 'video', mime: 'video/mp4' }],
  ['m4v', { kind: 'video', mime: 'video/mp4' }],
  ['mov', { kind: 'video', mime: 'video/quicktime' }],
  ['webm', { kind: 'video', mime: 'video/webm' }],
  ['ogv', { kind: 'video', mime: 'video/ogg' }],
  ['mkv', { kind: 'video', mime: 'video/x-matroska' }],
  ['avi', { kind: 'video', mime: 'video/x-msvideo' }],
  // audio
  ['mp3', { kind: 'audio', mime: 'audio/mpeg' }],
  ['wav', { kind: 'audio', mime: 'audio/wav' }],
  ['ogg', { kind: 'audio', mime: 'audio/ogg' }],
  ['oga', { kind: 'audio', mime: 'audio/ogg' }],
  ['opus', { kind: 'audio', mime: 'audio/ogg' }],
  ['flac', { kind: 'audio', mime: 'audio/flac' }],
  ['m4a', { kind: 'audio', mime: 'audio/mp4' }],
  ['aac', { kind: 'audio', mime: 'audio/aac' }],
  ['weba', { kind: 'audio', mime: 'audio/webm' }]
])

/** The media type for a repository path, or null if it is not previewable. */
export function previewKindFor(
  path: string
): { kind: PreviewKind; mime: string } | null {
  const dot = path.lastIndexOf('.')
  if (dot === -1 || dot === path.length - 1) return null
  // A dot inside the last segment only counts as the extension boundary
  // ("dir.old/file" has no extension).
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (dot < lastSep) return null
  return MEDIA_TYPES.get(path.slice(dot + 1).toLowerCase()) ?? null
}

/**
 * Bytes of `path` from the working tree, or from commit `sha`'s tree when a
 * sha is given. Null when the file is not a previewable media type, has
 * vanished (deleted rows, stale selections), or cannot be read.
 */
export async function getPreview(
  repoPath: string,
  path: string,
  sha?: string
): Promise<FilePreview | null> {
  const type = previewKindFor(path)
  if (type === null) return null

  let byteLength: number
  let bytes: Buffer | null

  if (sha === undefined) {
    try {
      // safeJoin also answers the containment question; a deleted file or a
      // path with `..` segments simply yields no preview.
      const info = await stat(safeJoin(repoPath, path))
      if (!info.isFile()) return null
      byteLength = info.size
      bytes = byteLength > PREVIEW_SIZE_LIMIT ? null : await readFile(safeJoin(repoPath, path))
    } catch {
      return null
    }
  } else {
    // Read the blob straight out of the object store — byte-exact regardless
    // of checkout state, working-tree filters or line endings. `cat-file -s`
    // is the cheap size probe so oversized videos are refused without being
    // streamed through the pipe.
    const size = await gitCatFileSize(repoPath, sha, path)
    if (size === null) return null
    byteLength = size
    bytes =
      byteLength > PREVIEW_SIZE_LIMIT ? null : await gitCatFileBlob(repoPath, sha, path)
    if (bytes === null && byteLength <= PREVIEW_SIZE_LIMIT) return null
  }

  if (bytes === null) return { kind: type.kind, mime: type.mime, byteLength }
  // Hand over an exact-size ArrayBuffer copy; a Buffer slice's shared pool
  // would otherwise transfer its whole 8 KiB block over IPC.
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
  return { kind: type.kind, mime: type.mime, byteLength, data }
}

/**
 * Minimal raw-output git runner: execGit decodes stdout as UTF-8, which
 * destroys blob bytes. Read-only plumbing, so no sandbox rerun is needed.
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
