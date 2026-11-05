import type { FilePreview, PreviewKind, PreviewResource } from '../../shared/models'
import {
  MODEL_FORMATS,
  type ModelFormat,
  extensionOf,
  modelSidecarRefs,
  mtlSidecarRefs,
  normalizeRepoPath
} from '../../shared/model-resources'
import { readRepoFileBytes } from './file-bytes'

/**
 * Media previews for the diff pane. Git reports image/video/audio/model
 * changes as binary, so the text diff has nothing to show; this module reads
 * the actual bytes — from the working tree, or from a commit's tree when a sha
 * is given — so the renderer can wrap them in a blob URL and play them.
 *
 * For 3D models it also follows the file's own references (.gltf buffers and
 * images, .obj material libraries and the textures they map, Collada images,
 * FBX texture paths) and ships those alongside, because a model on its own is
 * usually an empty shell.
 */

/**
 * Above this size a preview is refused: a blob URL that large would sit in
 * renderer memory doing nothing for the vast majority of formats people
 * actually commit (raw footage aside). The panel explains and offers Open.
 */
export const PREVIEW_SIZE_LIMIT = 128 * 1024 * 1024

/** Caps on the sidecars a model drags in, so one .gltf cannot read the repo. */
export const MODEL_RESOURCE_LIMIT = 48
export const MODEL_RESOURCE_SIZE_LIMIT = 32 * 1024 * 1024
export const MODEL_RESOURCE_TOTAL_LIMIT = 96 * 1024 * 1024

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
  ['weba', { kind: 'audio', mime: 'audio/webm' }],
  // 3D models, from the one format table the viewer shares with the renderer
  ...modelTypes()
])

function modelTypes(): [string, { kind: PreviewKind; mime: string }][] {
  return (Object.keys(MODEL_FORMATS) as ModelFormat[]).map(format => [
    MODEL_FORMATS[format].extension,
    { kind: 'model' as const, mime: MODEL_FORMATS[format].mime }
  ])
}

/** The media type for a repository path, or null if it is not previewable. */
export function previewKindFor(
  path: string
): { kind: PreviewKind; mime: string } | null {
  const ext = extensionOf(path)
  return ext === null ? null : MEDIA_TYPES.get(ext) ?? null
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

  const file = await readRepoFileBytes(repoPath, path, sha, PREVIEW_SIZE_LIMIT)
  if (file === null) return null
  // An oversized model reports its size without bytes, exactly as a video does.
  if (file.bytes === null) return { kind: type.kind, mime: type.mime, byteLength: file.byteLength }

  // Hand over an exact-size ArrayBuffer copy; a Buffer slice's shared pool
  // would otherwise transfer its whole 8 KiB block over IPC.
  const preview: FilePreview = {
    kind: type.kind,
    mime: type.mime,
    byteLength: file.byteLength,
    data: toArrayBuffer(file.bytes)
  }
  if (type.kind !== 'model') return preview
  return { ...preview, ...(await collectModelResources(repoPath, path, sha, file.bytes)) }
}

export interface ModelResources {
  readonly resources: PreviewResource[]
  /** True when a cap stopped the walk; the caption says the set is partial. */
  readonly resourcesTruncated?: boolean
}

/**
 * Breadth-first walk of the files a model references, read from the same place
 * as the model itself (working tree, or the same commit's tree). Unreadable
 * references are dropped quietly — the viewer shows the model without whatever
 * the repository does not contain.
 */
export async function collectModelResources(
  repoPath: string,
  path: string,
  sha: string | undefined,
  modelBytes: Buffer
): Promise<ModelResources> {
  const resources: PreviewResource[] = []
  const seen = new Set<string>()
  const root = normalizeRepoPath(path)
  if (root !== null) seen.add(root)

  let queue = refsOf(path, modelBytes)
  let total = 0
  let truncated = false

  // Two hops is all the formats in use need: model → library → images. A
  // .gltf inside a .gltf, or a .mtl naming another .mtl, is out of scope.
  for (let depth = 0; depth < 2 && queue.length > 0; depth++) {
    const next: string[] = []
    for (const ref of queue) {
      if (seen.has(ref)) continue
      if (resources.length >= MODEL_RESOURCE_LIMIT) {
        truncated = true
        break
      }
      seen.add(ref)
      const file = await readRepoFileBytes(repoPath, ref, sha, MODEL_RESOURCE_SIZE_LIMIT)
      if (file === null) continue
      if (file.bytes === null || total + file.byteLength > MODEL_RESOURCE_TOTAL_LIMIT) {
        // Too big to ship, or it would push the set past its budget: the model
        // renders without it and the caption marks the set incomplete.
        truncated = true
        continue
      }
      total += file.byteLength
      resources.push({ path: ref, byteLength: file.byteLength, data: toArrayBuffer(file.bytes) })
      next.push(...refsOf(ref, file.bytes))
    }
    queue = next
  }
  return truncated
    ? { resources, resourcesTruncated: true }
    : { resources }
}

/** Sidecar references of a model or of one of its sidecars, by format. */
function refsOf(path: string, bytes: Buffer): string[] {
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (extensionOf(path) === 'mtl') return mtlSidecarRefs(path, view)
  return modelSidecarRefs(path, view)
}

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
}
