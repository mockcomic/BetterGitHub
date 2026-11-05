/**
 * Sidecar files of 3D model formats.
 *
 * A model file is rarely the whole asset: `.gltf` is a manifest whose geometry
 * usually sits in a sibling `.bin` and its images in a `./textures` folder,
 * `.obj` names a `.mtl` that names the images, `.dae` points at them directly,
 * and `.fbx` either embeds them or references the author's own absolute path.
 * The main process reads these references so a model preview arrives as one
 * payload (see src/main/git/preview.ts); the renderer then answers every URL
 * three.js asks for from that payload (see src/renderer/src/model-view).
 *
 * Everything here is pure string/byte work, shared by both sides and by the
 * tests, so the path rules exist exactly once.
 */

/** The model families Aspen's viewer can read. */
export type ModelFormat = 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'ply' | 'dae'

export interface ModelFormatInfo {
  readonly mime: string
  readonly extension: string
}

/** Format metadata. One table feeds the main-side extension map and the renderer's loader choice. */
export const MODEL_FORMATS: Readonly<Record<ModelFormat, ModelFormatInfo>> = {
  glb: { mime: 'model/gltf-binary', extension: 'glb' },
  gltf: { mime: 'model/gltf+json', extension: 'gltf' },
  // FBX has no registered media type; FBXLoader sniffs ASCII vs binary itself.
  fbx: { mime: 'application/octet-stream', extension: 'fbx' },
  obj: { mime: 'model/obj', extension: 'obj' },
  stl: { mime: 'model/stl', extension: 'stl' },
  ply: { mime: 'model/ply', extension: 'ply' },
  dae: { mime: 'model/vnd.collada+xml', extension: 'dae' }
}

/** The last path-segment extension in lower case, or null. */
export function extensionOf(path: string): string | null {
  const dot = path.lastIndexOf('.')
  if (dot === -1 || dot === path.length - 1) return null
  // A dot inside the last segment only counts as the extension boundary
  // ("dir.old/file" has no extension).
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (dot < lastSep) return null
  return path.slice(dot + 1).toLowerCase()
}

/** The model format for a repository path, or null if it is not a model. */
export function modelFormatFor(path: string): ModelFormat | null {
  const ext = extensionOf(path)
  if (ext === null) return null
  for (const format of Object.keys(MODEL_FORMATS) as ModelFormat[]) {
    if (MODEL_FORMATS[format].extension === ext) return format
  }
  return null
}

/** Path segments of a repository path, backslashes folded, empty and `.` parts dropped. */
function segmentsOf(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter(part => part.length > 0 && part !== '.')
}

/** Repository-relative path, or null when the parts do not form one. */
export function normalizeRepoPath(path: string): string | null {
  const parts = segmentsOf(path)
  return parts.length > 0 ? parts.join('/') : null
}

/** Repository-relative folder a path sits in ('' for a repo-root file). */
export function repoDirOf(path: string): string {
  const parts = segmentsOf(path)
  parts.pop()
  return parts.join('/')
}

/**
 * Resolve one model reference (`.gltf` buffer uri, `mtllib`, FBX
 * `RelativeFilename`, Collada image…) to a repository-relative path, against
 * the folder of the file that referenced it. Null for anything outside the
 * repository: data URIs, `http:`/`file:` locations, absolute paths, or refs
 * that climb out of the repo with `..`.
 */
export function resolveModelUri(baseDir: string, rawUri: string): string | null {
  let uri = rawUri.trim().replace(/^["']+|["']+$/g, '').replace(/\\/g, '/')
  // Collada prefixes locally-authored paths with "#".
  uri = uri.replace(/^#+/, '')
  for (const cut of ['#', '?']) {
    const at = uri.indexOf(cut)
    if (at !== -1) uri = uri.slice(0, at)
  }
  if (uri === '') return null
  try {
    uri = decodeURIComponent(uri)
  } catch {
    // A stray "%" is not grounds to lose the reference.
  }
  // A leading "scheme:" (http:, file:, and Windows drive letters) means the
  // reference does not live in this repository.
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) return null
  const parts = baseDir === '' ? [] : segmentsOf(baseDir)
  for (const part of uri.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.length > 0 ? parts.join('/') : null
}

/**
 * First-level sidecar references inside a model (or sidecar) file, as
 * repository-relative paths — deduplicated and sorted. Empty for formats that
 * carry everything themselves (.glb, .stl, .ply) and for unparsable files:
 * a model that fails here still renders, just without what it could not name.
 */
export function modelSidecarRefs(path: string, bytes: Uint8Array): string[] {
  const format = modelFormatFor(path)
  if (format === null || format === 'stl' || format === 'ply') return []
  const baseDir = repoDirOf(normalizeRepoPath(path) ?? path)
  const raw: string[] = []

  switch (format) {
    case 'glb': {
      const json = glbJsonChunk(bytes)
      if (json !== null) raw.push(...gltfRefs(json))
      break
    }
    case 'gltf': {
      raw.push(...gltfRefs(decodeText(bytes)))
      break
    }
    case 'obj': {
      // "mtllib" may name several libraries at once.
      for (const value of patternRefs(
        decodeText(bytes),
        /^[ \t]*mtllib[ \t]+(.+?)[ \t]*$/gim
      )) {
        raw.push(...splitUnquoted(value))
      }
      break
    }
    case 'dae': {
      const text = decodeText(bytes)
      raw.push(...patternRefs(text, /<init_from>\s*([^<\s][^<]*?)\s*<\/init_from>/gi))
      raw.push(...patternRefs(text, /\bfilename\s*=\s*"([^"]+)"/gi))
      break
    }
    case 'fbx': {
      raw.push(...fbxRefs(bytes))
      break
    }
  }

  // References inside the files named here (.mtl maps, a nested manifest) are
  // picked up by the caller, which re-scans each sidecar it manages to read.
  const refs: string[] = []
  for (const candidate of raw) {
    const resolved = resolveModelUri(baseDir, candidate)
    if (resolved !== null && resolved !== normalizeRepoPath(path)) refs.push(resolved)
  }
  return [...new Set(refs)].sort()
}

/** References named by a material library (.mtl) — the images it maps. */
export function mtlSidecarRefs(path: string, bytes: Uint8Array): string[] {
  const text = decodeText(bytes)
  const values = patternRefs(
    text,
    /^[ \t]*(?:map_[a-z]+|bump|disp|decal|refl)[ \t]+(.+?)[ \t]*$/gim
  )
  const baseDir = repoDirOf(normalizeRepoPath(path) ?? path)
  const refs: string[] = []
  for (const value of values) {
    // A map line may carry flag tokens before the file name ("map_Kd -s 1 1 1
    // stone.png"), so a quoted name wins, else the last token.
    const tokens = splitUnquoted(value)
    const uri = tokens[tokens.length - 1] ?? ''
    const resolved = resolveModelUri(baseDir, uri)
    if (resolved !== null) refs.push(resolved)
  }
  return [...new Set(refs)].sort()
}

/**
 * Normalize a URL a loader asks for into a lookup key comparable with
 * repository-relative paths: schemes, hosts, query strings and hashes stripped,
 * backslashes folded, `.`/`..` applied. A bare "textures/stone.png", a
 * "file://assets/models/textures/stone.png" and a repo-relative path from a
 * `.mtl` therefore all produce the same key.
 */
export function modelResourceKey(url: string): string {
  let text = url.replace(/\\/g, '/')
  // Strip scheme and authority, repeatedly: "blob:http://host:port/art/a.png"
  // is a URL wrapping a URL. A "file:" path keeps its first segments — three
  // resolves a repo-relative base as "file://art/gltf/a.png", where "art" only
  // looks like an authority.
  for (let guard = 0; guard < 4; guard++) {
    const scheme = /^([a-z][a-z0-9+.-]*:)(\/\/)?/i.exec(text)
    if (scheme === null) break
    text = text.slice(scheme[1].length)
    if (scheme[2] === '//') {
      text = text.slice(2)
      if (scheme[1].toLowerCase() !== 'file:') {
        // A real authority runs to the next slash (or the end).
        const slash = text.indexOf('/')
        text = slash === -1 ? '' : text.slice(slash + 1)
      }
    }
    text = text.replace(/^\/+/, '')
  }
  for (const cut of ['#', '?']) {
    const at = text.indexOf(cut)
    if (at !== -1) text = text.slice(0, at)
  }
  try {
    text = decodeURIComponent(text)
  } catch {
    // keep the raw form
  }
  const parts: string[] = []
  for (const part of text.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

/**
 * Find the sidecar a loader is asking for. Loaders each resolve references
 * differently — GLTFLoader against the model's folder, MTLLoader against the
 * library's, FBXLoader against whatever path it was handed, sometimes just a
 * bare file name — so the match falls back from the exact key to a path suffix,
 * then to a unique basename. Ambiguous fallbacks are refused rather than
 * guessed: the loader then reports the missing file itself.
 */
export function findModelResource<T>(
  resources: ReadonlyMap<string, T>,
  requestedUrl: string
): T | undefined {
  const key = modelResourceKey(requestedUrl)
  if (key === '') return undefined
  const exact = resources.get(key)
  if (exact !== undefined) return exact

  const best: { rank: number; value: T }[] = []
  for (const [path, value] of resources) {
    let rank = -1
    if (key.endsWith('/' + path)) rank = 1
    else if (path.endsWith('/' + key)) rank = 2
    else if (path.slice(path.lastIndexOf('/') + 1) === key.slice(key.lastIndexOf('/') + 1)) rank = 3
    if (rank !== -1) best.push({ rank, value })
  }
  best.sort((a, b) => a.rank - b.rank)
  const winners = best.filter(candidate => candidate.rank === best[0]?.rank)
  return winners.length === 1 ? winners[0].value : undefined
}

/** Tokens of a whitespace-separated list, honouring quoted names that contain spaces. */
function splitUnquoted(value: string): string[] {
  const out: string[] = []
  for (const match of value.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)) {
    out.push(match[1] ?? match[2] ?? match[3])
  }
  return out
}

/** The JSON manifest chunk of a .glb, or null if the container is not one. */
function glbJsonChunk(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 20) return null
  // "glTF" magic, version 2, then a JSON chunk (type "JSON").
  if (view.getUint32(0, true) !== 0x46546c67) return null
  if (view.getUint32(4, true) !== 2) return null
  if (view.getUint32(12, true) < 12) return null
  if (view.getUint32(16, true) !== 0x4e4f534a) return null
  const start = 20
  const end = Math.min(bytes.byteLength, start + view.getUint32(12, true) - 8)
  return decodeText(bytes.subarray(start, end))
}

/** glTF `buffers[].uri` / `images[].uri` (embedded data URIs are not files). */
function gltfRefs(json: string): string[] {
  let doc: unknown
  try {
    doc = JSON.parse(json)
  } catch {
    return []
  }
  const refs: string[] = []
  if (typeof doc !== 'object' || doc === null) return refs
  for (const key of ['buffers', 'images']) {
    const list = (doc as Record<string, unknown>)[key]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const uri = (item as Record<string, unknown> | null)?.uri
      if (typeof uri === 'string' && !uri.startsWith('data:')) refs.push(uri)
    }
  }
  return refs
}

/** Every capture group 1 of a global regex, in document order. */
function patternRefs(text: string, pattern: RegExp): string[] {
  const out: string[] = []
  for (const match of text.matchAll(pattern)) {
    if (typeof match[1] === 'string' && match[1].trim() !== '') out.push(match[1])
  }
  return out
}

/**
 * Texture references of an FBX file. ASCII files state them under
 * `RelativeFilename`; binary files keep them as length-prefixed strings with no
 * cheaply reachable table, so the bytes are scanned for anything that looks
 * like a path to an image. Over-fetching is harmless — a reference that is not
 * in the repository simply yields nothing.
 */
function fbxRefs(bytes: Uint8Array): string[] {
  const head = decodeText(bytes.subarray(0, 4096))
  // The ASCII flavour is text all the way through, and always names its
  // properties; the binary flavour starts with the 21-byte Kaydara header.
  if (/FBXVersion|FBX Header:|Property: "/.test(head)) return asciiFbxRefs(decodeText(bytes))
  return binaryFbxRefs(bytes)
}

/**
 * ASCII FBX declares each texture path as
 * `Property: "RelativeFilename", "K", "", "textures\\body.png", ""`; the
 * position of the value among the quoted fields varies by exporter version, so
 * the path is whichever field past the name and type looks least like a
 * metadata token.
 */
function asciiFbxRefs(text: string): string[] {
  const refs: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('"RelativeFilename"')) continue
    const fields = [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map(match => unescapeFbx(match[1]))
      .filter(field => field.trim() !== '')
    const value = fields.slice(1).sort((a, b) => b.length - a.length)[0]
    if (value !== undefined) refs.push(...pathCandidates(value))
  }
  return refs
}

function binaryFbxRefs(bytes: Uint8Array): string[] {
  const refs: string[] = []
  let run = ''
  const flush = (): void => {
    if (run.length >= 4) refs.push(...pathCandidates(run))
    run = ''
  }
  for (const byte of bytes) {
    // Printable ASCII, with path separators and drive-letter colons allowed.
    const printable = (byte >= 0x20 && byte <= 0x7e) || byte === 0x09
    if (!printable) {
      flush()
      if (refs.length > 256) break
      continue
    }
    run += String.fromCharCode(byte)
  }
  flush()
  return refs.slice(0, 32)
}

/** Keep only runs that plausibly name an image, plus their bare file names. */
function pathCandidates(candidate: string): string[] {
  const text = candidate.trim()
  if (!/\.(png|jpg|jpeg|gif|bmp|tif|tiff|tga|ddp|exr|hdr|psd|jpeg2000)$/i.test(text)) return []
  const out = [text]
  const tail = text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1)
  if (tail !== text && tail.includes('.')) out.push(tail)
  return out
}

/** FBX ASCII escapes a backslash as "\x5C"; undo the hex pairs and the doubled ones. */
function unescapeFbx(value: string): string {
  return value
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    )
    .replace(/\\\\/g, '\\')
}

let decoder: TextDecoder | null = null

function decodeText(bytes: Uint8Array): string {
  decoder ??= new TextDecoder('utf-8')
  return decoder.decode(bytes)
}
