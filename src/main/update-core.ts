/**
 * The engine behind Aspen's self-update — the Nucleus doctrine (there:
 * src/main/update.js) in Aspen's house style. NO Electron imports: the
 * glue in src/main/updates.ts supplies app paths and the push channel, and
 * the unit tests (tests/updates-core.test.ts) drive everything here with
 * injected fetch/fs/spawn and a temp directory.
 *
 * Invariants to preserve when editing (they are the security model):
 * - Asset URLs are pinned to our repo's download path or GitHub's asset CDN
 *   over https (ASSET_URL_RE), and a followed redirect must land back on
 *   FINAL_URL_HOSTS. The renderer never steers a URL.
 * - Authenticity = the ed25519-signed update-manifest.json + .sig pair
 *   verified against the committed public key. Unsigned / tampered /
 *   half-pair releases FAIL CLOSED: still shown, still openable, but
 *   download() refuses to fetch and runInstaller() refuses to spawn.
 * - runInstaller() only spawns paths this module sha256-verified THIS
 *   session (verifiedDownloads).
 * - sanitizeRelease round-trips BOTH the GitHub API shape and our own
 *   cached shape — the update-info.json cache is fed back through it.
 *   `authenticated` deliberately does NOT survive the cache.
 */
import { createHash, createPublicKey, verify as ed25519Verify } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  applyManifest,
  ASSET_URL_RE,
  decide,
  FINAL_URL_HOSTS,
  MANIFEST_NAME,
  MANIFEST_SIG_NAME,
  RELEASES_API_URL,
  RELEASES_URL,
  sanitizeRelease,
  SHA256_RE,
  TAG_RE,
  UPDATE_REPO,
  type ManifestAsset,
  type SanitizedAsset,
  type SanitizedRelease,
  type VerifiedManifest
} from '../shared/updates'

const FETCH_TIMEOUT_MS = 12_000
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000 // a ~120 MB installer over a slow link
const JSON_MAX_BYTES = 256 * 1024 // one release JSON never needs to be bigger
const MANIFEST_MAX_BYTES = 64 * 1024
const DOWNLOAD_MAX_BYTES = 512 * 1024 * 1024 // enforced DURING the transfer

/* The trust anchor for update authenticity: the PUBLIC half of a release-time
   ed25519 keypair (scripts/update-keygen.mjs generates it; the private half
   lives outside the repo at ~/.aspen/update-signing.key). Bundled at build
   time via ?raw (electron-vite inlines the exact bytes), so an empty or
   unreadable file is a build-time accident, not a runtime hole; absent or
   blank fails CLOSED — every release is browse-only, never auto-run. */
import TRUSTED_KEY_RAW from './update-key.pub.pem?raw'
const TRUSTED_KEY_PEM: string | null =
  typeof TRUSTED_KEY_RAW === 'string' && TRUSTED_KEY_RAW.includes('BEGIN PUBLIC KEY')
    ? TRUSTED_KEY_RAW
    : null

/* ------------------------------ fetch policy ------------------------------ */

export interface FetchInit {
  readonly headers?: Record<string, string>
  readonly signal?: AbortSignal
  readonly redirect?: 'follow' | 'manual' | 'error'
}

export interface FetchLike {
  (url: string, init?: FetchInit): Promise<Response>
}

/** A transport with a per-call timeout budget (explicit signals win; a
 *  fetch stand-in without AbortSignal support degrades to no timeout). */
function makeFetch(timeoutMs: number): FetchLike {
  return (url, init) =>
    fetch(url, {
      ...(init ?? {}),
      cache: 'no-store',
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs)
    })
}

const defaultFetch: FetchLike = makeFetch(FETCH_TIMEOUT_MS)
const downloadFetch: FetchLike = makeFetch(DOWNLOAD_TIMEOUT_MS)

/* ------------------------------- module state ------------------------------ */

/** Response bodies are read through a hard cap — a lying host cannot stream
 *  the world into memory (or onto disk) on an update path. */
async function readCapped(
  res: Response,
  maxBytes: number
): Promise<{ buf?: Buffer; overflow: boolean; failed: boolean }> {
  if (!res.body) return { overflow: false, failed: false }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    let done = false
    let value: Uint8Array | undefined
    try {
      const r = await reader.read()
      done = r.done
      value = r.value
    } catch {
      return { overflow: false, failed: true }
    }
    if (done) break
    if (value === undefined) continue
    total += value.byteLength
    if (total > maxBytes) return { overflow: true, failed: false }
    chunks.push(value)
  }
  return { buf: Buffer.concat(chunks), overflow: false, failed: false }
}

/* ------------------------------- module state ------------------------------ */

let infoCachePath: string | null = null
let latest: SanitizedRelease | null = null
let lastCheckMs = 0
let lastError: string | null = null
let checking: Promise<CheckOutcome> | null = null // concurrent checks share one request

/** Absolute paths download() sha256-verified THIS session. runInstaller()
 *  spawns NOTHING outside this set: a failed, unverified or never-downloaded
 *  file cannot reach child_process even if a caller asks it to (manual
 *  installation from the Downloads folder is always still the user's option). */
const verifiedDownloads = new Set<string>()

/** Point the cache at (or away from) disk; called once from initUpdates. */
export function configure(cacheDir: string | null): void {
  infoCachePath = cacheDir === null ? null : join(cacheDir, 'update-info.json')
  loadCache()
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/* Read the cache back through the SAME sanitizer — a hand-edited or stale
   file can at worst yield null, never smuggle a field the API contract
   lacks. `authenticated` is stripped: a cached release is browse-only until
   the next check re-verifies its manifest (seconds after launch). */
function loadCache(): void {
  if (infoCachePath === null) return
  try {
    const raw: unknown = JSON.parse(readFileSync(infoCachePath, 'utf8'))
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const rec = raw as Record<string, unknown>
      latest = sanitizeRelease(rec.release ?? null)
      if (latest !== null) delete (latest as { authenticated?: boolean }).authenticated
      const ms = rec.lastCheckMs
      if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) lastCheckMs = ms
    }
  } catch {
    /* absent/garbage = the first check tells the whole story */
  }
}

function saveCache(): void {
  if (infoCachePath === null || latest === null) return
  try {
    mkdirSync(dirname(infoCachePath), { recursive: true })
    const tmp = infoCachePath + '.tmp'
    writeFileSync(tmp, JSON.stringify({ lastCheckMs, release: latest }, null, 1), 'utf8')
    renameSync(tmp, infoCachePath) // same atomic discipline as the settings store
  } catch {
    /* the cache is a convenience, never a requirement */
  }
}

/* --------------------------- signed manifests ----------------------------- */

/** Verify manifest bytes against the base64 detached signature and the
 *  pinned key. Pure: `{ keyPem }` injectable for tests (null key = fail
 *  closed). The reason strings are shown to the user, so they say WHAT
 *  failed, not how the crypto works. */
export function verifyManifest(
  bytes: Buffer,
  sigB64: string,
  expectTag: string,
  opts: { keyPem?: string | null } = {}
): { ok: true; manifest: VerifiedManifest } | { ok: false; reason: string } {
  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })
  const keyPem = opts.keyPem === undefined ? TRUSTED_KEY_PEM : opts.keyPem
  if (!keyPem) return fail('no signing key is bundled with this build')
  if (!Buffer.isBuffer(bytes)) return fail('manifest is not bytes')
  if (bytes.length === 0 || bytes.length > MANIFEST_MAX_BYTES) return fail('manifest size is invalid')
  if (typeof sigB64 !== 'string' || !/^[A-Za-z0-9+/=\s]{64,128}$/.test(sigB64.trim())) {
    return fail('signature is malformed')
  }
  const sig = Buffer.from(sigB64.trim(), 'base64')
  if (sig.length !== 64) return fail('signature is malformed')
  let pub: ReturnType<typeof createPublicKey>
  try {
    pub = createPublicKey(keyPem)
  } catch {
    return fail('the bundled signing key is unreadable')
  }
  let ok = false
  try {
    // ed25519: no algorithm parameter (null), signature over the exact bytes.
    ok = ed25519Verify(null, bytes, pub, sig)
  } catch {
    ok = false
  }
  if (!ok) return fail('signature does not verify (tampered manifest or the wrong key)')
  let raw: unknown
  try {
    raw = JSON.parse(bytes.toString('utf8'))
  } catch {
    return fail('manifest is not valid JSON')
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return fail('manifest is not an object')
  const m = raw as Record<string, unknown>
  if (m.schema !== 1) return fail('manifest schema is not understood by this build')
  if (m.repo !== UPDATE_REPO) return fail('manifest was signed for a different repository')
  if (typeof m.tag !== 'string' || m.tag !== expectTag) return fail('manifest was signed for a different release')
  if (!Number.isFinite(Date.parse(String(m.generatedAt ?? '')))) return fail('manifest carries no valid date')
  if (!Array.isArray(m.assets) || m.assets.length === 0 || m.assets.length > 16) {
    return fail('manifest lists no usable files')
  }
  const assets: ManifestAsset[] = []
  for (const item of m.assets as unknown[]) {
    const a = (item !== null && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const name = typeof a.name === 'string' ? a.name : ''
    const sha256 = typeof a.sha256 === 'string' ? a.sha256.toLowerCase() : ''
    if (!TAG_RE.test(name) || !/[\w]/.test(name.replace(/^\.+/, ''))) {
      return fail('manifest carries a bad file name')
    }
    if (!SHA256_RE.test(sha256)) return fail('manifest carries a bad checksum')
    assets.push({ name, sha256, size: Number.isFinite(+(a.size as number)) && +(a.size as number) >= 0 ? +(a.size as number) : null })
  }
  return { ok: true, manifest: { schema: 1, tag: m.tag, generatedAt: String(m.generatedAt), assets } }
}

/** Fetch one asset: pinned URL (the list is already sanitized), https-only
 *  redirects back onto the update hosts, hard byte cap. The exact bytes, or
 *  null on any transport failure (fail-SOFT at the caller: no manifest
 *  degrades to browse-only, never to an error or an unsigned auto-install). */
async function fetchAssetBytes(
  asset: SanitizedAsset,
  doFetch: FetchLike,
  maxBytes: number
): Promise<Buffer | null> {
  try {
    const res = await doFetch(asset.url, {
      redirect: 'follow',
      headers: { 'User-Agent': `aspen/${'update-manifest'}` }
    })
    if (!res || !res.ok) return null
    if (typeof res.url === 'string' && res.url !== '') {
      try {
        const u = new URL(res.url)
        if (u.protocol !== 'https:' || !FINAL_URL_HOSTS.includes(u.hostname)) return null
      } catch {
        return null
      }
    }
    const got = await readCapped(res, maxBytes)
    if (got.overflow || got.failed || got.buf === undefined) return null
    return got.buf
  } catch {
    return null
  }
}

/* --------------------------------- check ---------------------------------- */

export interface CheckOutcome {
  readonly ok: boolean
  readonly status: 'available' | 'up-to-date' | 'none' | 'error'
  readonly kind?: 'version' | 'build'
  readonly error?: string
}

export interface CheckOptions {
  appVersion: string
  /** mtime (ms) of the running app's install directory — the caller's proxy
   *  for "when was THIS build made" for the same-version new-build rule. */
  appPublishMs?: number
  fetchImpl?: FetchLike
  headers?: Record<string, string>
  /** Test seam for the trust anchor. */
  verifyKeyPem?: string | null
}

/**
 * One request to the Releases API, sanitized, manifest-verified, and folded
 * into the module's state. Failures leave the LAST GOOD answer in place —
 * prefer stale truth over a transient network blip; the next successful
 * check replaces it.
 */
export async function check(opts: CheckOptions): Promise<CheckOutcome> {
  const doFetch = opts.fetchImpl ?? defaultFetch
  if (checking !== null) return checking // share one in-flight check
  const run = (async (): Promise<CheckOutcome> => {
    try {
      const res = await doFetch(RELEASES_API_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          // GitHub's API rejects UA-less requests; version-tagged so a flood
          // of checks is attributable in server logs.
          'User-Agent': `aspen/update-check (${opts.appVersion || 'dev'})`,
          ...(opts.headers ?? {})
        }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const got = await readCapped(res, JSON_MAX_BYTES)
      if (got.overflow) throw new Error('release metadata over byte cap')
      if (got.failed || got.buf === undefined) throw new Error('unreadable response')
      let parsed: unknown
      try {
        parsed = JSON.parse(got.buf.toString('utf8'))
      } catch {
        throw new Error('GitHub returned a release payload Aspen could not read')
      }
      const rel = sanitizeRelease(parsed)
      lastCheckMs = Date.now()
      lastError = null
      if (rel === null || rel.draft || rel.prerelease) {
        latest = null
        return { ok: true, status: 'none' }
      }
      /* Authenticity: the release may carry the signed manifest pair.
         Verifying it is best-effort FETCH but STRICT VERDICT — a half pair,
         a transport failure, or a failed signature leaves the release
         browse-only (authenticated:false). The absence of proof is never
         treated as proof: there is no unsigned fallback. */
      rel.authenticated = false
      rel.authReason = rel.manifestPair === 'none' ? 'no manifest' : 'no valid manifest'
      if (rel.manifestPair === 'pair') {
        const mA = rel.assets.find(a => a.name === MANIFEST_NAME)
        const mS = rel.assets.find(a => a.name === MANIFEST_SIG_NAME)
        if (mA && mS) {
          const [manifestBytes, sigBytes] = await Promise.all([
            fetchAssetBytes(mA, doFetch, MANIFEST_MAX_BYTES),
            fetchAssetBytes(mS, doFetch, 1024)
          ])
          if (manifestBytes !== null && sigBytes !== null) {
            const v = verifyManifest(manifestBytes, sigBytes.toString('utf8').trim(), rel.tag, {
              keyPem: opts.verifyKeyPem
            })
            if (v.ok) Object.assign(rel, applyManifest(rel, v.manifest))
            else rel.authReason = v.reason
          }
        }
      }
      latest = rel
      saveCache()
      const verdict = decide(
        rel,
        opts.appVersion,
        Number.isFinite(+(opts.appPublishMs ?? NaN)) ? +opts.appPublishMs! : NaN
      )
      if (verdict.status === 'available') return { ok: true, ...verdict }
      if (verdict.status === 'up-to-date') return { ok: true, status: 'up-to-date' }
      return { ok: true, status: 'none' }
    } catch (err) {
      lastError = messageOf(err)
      return { ok: false, status: 'error', error: lastError }
    } finally {
      checking = null
    }
  })()
  checking = run
  return run
}

/** What the UI may be told right now, purely from local state. A failed
 *  check AFTER a good one keeps showing the last-known answer. */
export function snapshot(appVersion: string, appPublishMs?: number): {
  release: SanitizedRelease | null
  verdict: ReturnType<typeof decide>
  lastCheckMs: number
  error: string | null
} {
  const verdict = latest !== null
    ? decide(
        latest,
        appVersion,
        Number.isFinite(+(appPublishMs ?? NaN)) ? +(appPublishMs as number) : NaN
      )
    : ({ status: 'none' } as const)
  return { release: latest, verdict, lastCheckMs, error: latest === null ? lastError : null }
}

/* ---------------------------- download + hand-off -------------------------- */

export interface DownloadOptions {
  asset: SanitizedAsset
  /** The release's authenticated verdict — the ONLY reason a fetch may start. */
  authenticated: boolean
  /** Where to write the installer (the Downloads folder). */
  destDir: string
  tag?: string
  fetchImpl?: FetchLike
  onProgress?: (p: { pct: number | null; bytes: number; total: number | null }) => void
  maxBytes?: number
}

export type DownloadResult =
  | { ok: true; path: string; size: number; sha256: string; verified: true }
  | { ok: false; error: string }

/**
 * Stream one sanitized asset to `destDir`, verify it against the manifest's
 * sha256, and leave the finished file on disk (nothing is executed here).
 * Bytes are capped DURING the transfer and a failure always cleans up its
 * .part. Injectable fetch + real fs into a caller-chosen folder, so this is
 * unit-testable with a fake response.
 */
export async function download(opts: DownloadOptions): Promise<DownloadResult> {
  const { asset } = opts
  if (
    typeof asset?.url !== 'string' ||
    typeof asset.name !== 'string' ||
    !TAG_RE.test(asset.name) ||
    !assetLooksDownloadable(asset.url)
  ) {
    return { ok: false, error: 'no downloadable file in that release' }
  }
  /* Authenticity before bytes: only a release whose signed manifest verified
     may download. An unauthenticated release is browse-only — no unsigned
     fallback, ever. And an authenticated release with no digest for THIS
     asset (a contradiction we cannot resolve) is not runnable. */
  if (opts.authenticated !== true) {
    return { ok: false, error: 'that update is not authenticated; open the release page instead' }
  }
  if (typeof asset.sha256 !== 'string' || !SHA256_RE.test(asset.sha256)) {
    return { ok: false, error: 'no published checksum for that file' }
  }
  const destDir = typeof opts.destDir === 'string' ? opts.destDir : ''
  if (destDir === '') return { ok: false, error: 'no Downloads folder to write to' }
  const doFetch = opts.fetchImpl ?? downloadFetch
  const maxBytes = opts.maxBytes !== undefined && Number.isFinite(+opts.maxBytes) && +opts.maxBytes > 0
    ? +opts.maxBytes
    : DOWNLOAD_MAX_BYTES
  const base = basename(asset.name) // TAG_RE-checked: no path, no dot-dot
  const finalPath = join(destDir, base)
  const partPath = finalPath + '.part'
  const total = Number.isFinite(+(asset.size ?? NaN)) && +(asset.size as number) > 0 ? +(asset.size as number) : null

  let bytes = 0
  let lastPct: number | null = -1
  let out: ReturnType<typeof createWriteStream> | null = null
  try {
    mkdirSync(destDir, { recursive: true })
    const res = await doFetch(asset.url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'aspen/update-download' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (!res.body) throw new Error('empty response')
    /* Followed redirects must still end on the update hosts over https: a
       302 to a stranger or a plain-http drop downgrades the trust chain
       before the checksum ever runs. A fetch stand-in without res.url never
       moved. */
    const finalUrl = typeof res.url === 'string' && res.url !== '' ? res.url : asset.url
    let u: URL
    try {
      u = new URL(finalUrl)
    } catch {
      throw new Error('unreadable redirect target')
    }
    if (u.protocol !== 'https:' || !FINAL_URL_HOSTS.includes(u.hostname)) {
      throw new Error('download left the update hosts')
    }
    const hash = createHash('sha256')
    try {
      rmSync(partPath, { force: true })
    } catch {
      /* stale .part from a killed run */
    }
    out = createWriteStream(partPath)
    // A destroyed stream can still emit 'error' asynchronously (EBADF on
    // Windows, late writes); swallow it — the download's own verdict is
    // whatever the try/catch produced, never a stray unhandled error.
    out.on('error', () => undefined)
    const reader = res.body.getReader()
    for (;;) {
      const r = await reader.read()
      if (r.done) break
      if (r.value === undefined) continue
      const chunk = Buffer.from(r.value.buffer, r.value.byteOffset, r.value.byteLength)
      bytes += chunk.length
      if (bytes > maxBytes) throw new Error('download over byte cap')
      hash.update(chunk)
      if (!out.write(chunk)) {
        // honor backpressure
        await new Promise<void>(resolve => out!.once('drain', () => resolve()))
      }
      const pct = total !== null ? Math.min(100, Math.floor((bytes / total) * 100)) : null
      if (pct !== lastPct) {
        lastPct = pct
        opts.onProgress?.({ pct, bytes, total })
      }
    }
    await new Promise<void>(resolve => out!.end(() => resolve()))
    out = null
    const digest = hash.digest('hex')
    if (digest !== asset.sha256) throw new Error('checksum mismatch')
    try {
      rmSync(finalPath, { force: true })
    } catch {
      /* a re-download replaces it */
    }
    renameSync(partPath, finalPath) // same folder, so atomic
    verifiedDownloads.add(finalPath) // the ONLY paths runInstaller will spawn
    return { ok: true, path: finalPath, size: bytes, sha256: digest, verified: true }
  } catch (err) {
    if (out !== null) {
      try {
        out.destroy()
      } catch {
        /* already gone */
      }
    }
    try {
      rmSync(partPath, { force: true })
    } catch {
      /* nothing to clean */
    }
    return { ok: false, error: messageOf(err) }
  }
}

/** Re-check the URL shape at the last gate (defense in depth: the asset
 *  already came through sanitizeRelease). */
function assetLooksDownloadable(url: string): boolean {
  return ASSET_URL_RE.test(url)
}

/**
 * Launch the downloaded installer DETACHED and return immediately: the
 * caller quits Aspen so the update can replace the running files. The path
 * is one this module just wrote (never a renderer string), and no shell is
 * involved, so a filename with spaces cannot be re-parsed into arguments.
 * `spawnImpl` is injectable so the unit test never starts a real process.
 */
export function runInstaller(
  filePath: string,
  opts: { spawnImpl?: typeof spawn } = {}
): { ok: true } | { ok: false; error: string } {
  if (typeof filePath !== 'string' || !/\.exe$/i.test(filePath)) return { ok: false, error: 'not an update file' }
  if (!verifiedDownloads.has(filePath)) return { ok: false, error: 'that file was never verified' }
  const spawnImpl = opts.spawnImpl ?? spawn
  try {
    const child = spawnImpl(filePath, ['--updated'], { detached: true, stdio: 'ignore' })
    if (child && typeof child.unref === 'function') child.unref()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: messageOf(err) }
  }
}

export const RELEASE_PAGE_FALLBACK = RELEASES_URL

/* Test-only state wipe (the module is a singleton like the other main-side
   services; each scenario must start from a blank slate). */
export function _reset(): void {
  latest = null
  lastCheckMs = 0
  lastError = null
  checking = null
  infoCachePath = null
  verifiedDownloads.clear()
}

export function _internals(): {
  release: SanitizedRelease | null
  lastCheckMs: number
  verifiedDownloads: ReadonlySet<string>
} {
  return { release: latest, lastCheckMs, verifiedDownloads }
}
