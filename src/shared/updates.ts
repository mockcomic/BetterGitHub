/**
 * The self-update contract shared by main (src/main/updates.ts +
 * src/main/update-core.ts) and the renderer (store + About dialog), plus the
 * pure parsing/comparison/sanitizing helpers the GitHub Releases check runs
 * on. Electron-free AND node-free on purpose: the renderer bundles this
 * module, and tests import it directly (tests/updates.test.ts). Anything
 * needing node:fs/crypto lives in src/main/update-core.ts.
 *
 * The doctrine is Nucleus's (src/main/update.js there): check GitHub
 * Releases, ASK, and only then stream the published installer to the
 * Downloads folder, verify it against a signed manifest, and hand off.
 * Nothing is ever downloaded without an explicit yes, and a release without
 * a verifying update-manifest.json pair is browse-only — fail closed, no
 * unsigned fallback.
 */

/** The owner/repo whose Releases feed the updater. */
export const UPDATE_REPO_OWNER = 'mockcomic'
export const UPDATE_REPO_NAME = 'BetterGitHub'
export const UPDATE_REPO = `${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}`

/** Where every "get the update" affordance sends the user. */
export const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`
export const RELEASES_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`

/* Authenticated asset URLs may only ever point at our own release-download
   path or GitHub's asset CDN, over https. A doctored API response pointing
   its assets at some other host is dropped at the sanitizer, and a redirect
   that leaves these hosts aborts the download — the trust chain never
   downgrades below the checksum. */
export const TAG_RE = /^[\w.\-+]{1,100}$/
export const SHA256_RE = /^[a-f0-9]{64}$/
export const ASSET_URL_RE = new RegExp(
  '^(?:https://github\\.com/' + UPDATE_REPO + '/releases/download/[\\w.\\-+%]{1,120}/[\\w.\\-+%]{1,120}' +
  '|https://objects\\.githubusercontent\\.com/[^\\s]+)$'
)
export const FINAL_URL_HOSTS = ['github.com', 'objects.githubusercontent.com']

/** The signed manifest pair every release should carry (docs/update-signing.md). */
export const MANIFEST_NAME = 'update-manifest.json'
export const MANIFEST_SIG_NAME = 'update-manifest.json.sig'

/**
 * Where the update flow stands. 'available' carries `authenticated`: a
 * false there means browse-only — the release page is the escape hatch and
 * no download may start. 'error' is a failed check.
 */
export type UpdatePhase =
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error'

/** Main -> renderer push (UPDATE_STATE_CHANNEL) on every phase change. */
export interface UpdateState {
  readonly phase: UpdatePhase
  /** The newer version, once known. */
  readonly version?: string
  /** What kind of update 'available' names (see decide()): a version bump
   *  or a same-version new build. */
  readonly kind?: 'version' | 'build'
  /** False when the release carries no verifying signed manifest — the UI
   *  must then send the user to the releases page, never to a download. */
  readonly authenticated?: boolean
  /** Human-readable reason an available release is NOT authenticated. */
  readonly authReason?: string | null
  /** 0–100 while phase === 'downloading'. */
  readonly percent?: number
  /** Human-readable failure reason for phase === 'error'. */
  readonly error?: string
  /**
   * True when this build can download-and-run an installer itself
   * (packaged win32): the UI offers the download / restart flow.
   */
  readonly canInstall: boolean
  /** Absolute path of the verified installer once phase === 'ready'. */
  readonly installerPath?: string
  /** Always set — the escape hatch when in-app install is impossible. */
  readonly releaseUrl: string
}

/** The resolved value of the manual `checkForUpdates` IPC call. */
export interface UpdateCheckResult {
  readonly status: 'up-to-date' | 'available' | 'error'
  readonly currentVersion: string
  readonly version?: string
  readonly kind?: 'version' | 'build'
  /** False when no release could be read at all (offline, 404, …). */
  readonly releaseSeen: boolean
  readonly releaseUrl: string
  /** Release notes body for 'available' (markdown, renderer never renders it raw-critical). */
  readonly notes?: string
  /** Availability of a verifying signed manifest for the offered release. */
  readonly authenticated?: boolean
  readonly authReason?: string | null
  readonly error?: string
}

/** 'v0.2.0' / '0.2.0' → { major, minor, patch } on a valid core; null otherwise. */
export function parseVersionCore(
  raw: string
): { major: number; minor: number; patch: number } | null {
  const match = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:[-+][\w.\-+]*)?$/.exec(String(raw ?? '').trim())
  if (match === null) return null
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
    return null
  }
  return { major, minor, patch }
}

/** -1 / 0 / 1 like a comparator; an unparseable version sorts lowest, so a
 *  malformed tag can never be "newer" than a real one. */
export function compareVersionCores(
  a: { major: number; minor: number; patch: number } | null,
  b: { major: number; minor: number; patch: number } | null
): number {
  const x = a ?? { major: -1, minor: -1, patch: -1 }
  const y = b ?? { major: -1, minor: -1, patch: -1 }
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (x[k] !== y[k]) return x[k] > y[k] ? 1 : -1
  }
  return 0
}

/**
 * True only when `candidate` names a strictly newer stable core than
 * `current`. Unparseable inputs are never "newer" — a malformed tag must
 * not push a download at the user. A prerelease/build suffix on an equal
 * core (0.1.0-beta.1 vs 0.1.0) is not newer either.
 */
export function isVersionNewer(current: string, candidate: string): boolean {
  // An unparseable CURRENT version never receives a push: we cannot know
  // what we are running, so we cannot claim anything is newer.
  const a = parseVersionCore(current)
  if (a === null) return false
  return compareVersionCores(parseVersionCore(candidate), a) > 0
}

/** Rebuild (never trust) the release page URL from the repo and tag. */
export function releaseUrlFor(tag: string): string {
  return `${RELEASES_URL}/tag/${encodeURIComponent(tag)}`
}

/** One sanitized asset record. */
export interface SanitizedAsset {
  readonly name: string
  readonly url: string
  readonly size: number | null
  /** Lowercase hex digest, or null when nothing trustworthy vouches for it. */
  readonly sha256: string | null
}

/** A trimmed GitHub release JSON reduced to what the app may use; null if
 *  unusable. Unknown fields are dropped, not passed through. */
export interface SanitizedRelease {
  readonly tag: string
  readonly version: { major: number; minor: number; patch: number } | null
  readonly versionLabel: string
  readonly url: string
  readonly name: string
  readonly publishedAt: string
  readonly draft: boolean
  readonly prerelease: boolean
  readonly assets: readonly SanitizedAsset[]
  /** What the release carries of the manifest pair, before verification:
   *  'pair' | 'half' | 'none'. A half pair fails closed like a bad sig. */
  readonly manifestPair: 'pair' | 'half' | 'none'
  /** Settled by check(): true only when the manifest verifies (see
   *  verifyManifest + applyManifest in update-core). Deliberately NOT
   *  carried across the on-disk cache: read-back is data, not authority.
   *  (Mutable on purpose — check() folds the verdict in after sanitizing.) */
  authenticated?: boolean
  authReason?: string | null
}

/**
 * Accept BOTH shapes on the way in: the GitHub API fields (tag_name /
 * browser_download_url / published_at / digest `sha256:<hex>`) and this
 * module's own sanitized/cache shape (tag / url / publishedAt / sha256) —
 * update-info.json caches the sanitized release and the read-back runs
 * through here, so a sanitizer that only knew one shape silently kills the
 * cache.
 */
export function sanitizeRelease(raw: unknown): SanitizedRelease | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const tag = typeof obj.tag_name === 'string' ? obj.tag_name.trim()
    : typeof obj.tag === 'string' ? obj.tag.trim() : ''
  if (!TAG_RE.test(tag)) return null
  const publishedRaw = typeof obj.published_at === 'string' ? obj.published_at
    : typeof obj.publishedAt === 'string' ? obj.publishedAt : ''
  const publishedAt = publishedRaw !== '' && Number.isFinite(Date.parse(publishedRaw)) ? publishedRaw : null
  if (publishedAt === null) return null // the build-date rule needs the date
  const assets: SanitizedAsset[] = []
  let hasManifest = false
  let hasManifestSig = false
  if (Array.isArray(obj.assets)) {
    for (const item of obj.assets as unknown[]) {
      const a = (item !== null && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const name = typeof a.name === 'string' ? a.name.trim() : ''
      const url = (typeof a.browser_download_url === 'string' ? a.browser_download_url
        : typeof a.url === 'string' ? a.url : '').trim()
      if (!TAG_RE.test(name)) continue
      // A name with no word character outside leading dots ('.', '..', '...')
      // survives TAG_RE but basename()s to itself — the rename would aim at
      // the parent directory. Not a file name; drop it.
      if (!/[\w]/.test(name.replace(/^\.+/, ''))) continue
      if (!ASSET_URL_RE.test(url)) continue
      if (name === MANIFEST_NAME) hasManifest = true
      if (name === MANIFEST_SIG_NAME) hasManifestSig = true
      /* GitHub publishes `digest: "sha256:<hex>"` per asset — an independent
         digest to cross-check against the signed manifest. Absent stays
         null: the manifest (when it verifies) is the authority. */
      const d = typeof a.digest === 'string' ? a.digest.trim().toLowerCase() : ''
      const sha256 = /^sha256:[a-f0-9]{64}$/.test(d) ? d.slice(7)
        : SHA256_RE.test(d) ? d
          : typeof a.sha256 === 'string' && SHA256_RE.test(a.sha256) ? a.sha256 : null
      assets.push({ name, url, size: Number.isFinite(+(a.size as number)) ? +(a.size as number) : null, sha256 })
      if (assets.length >= 16) break // generous ceiling, bounded parsing
    }
  }
  return {
    tag,
    version: parseVersionCore(tag),
    versionLabel: tag.replace(/^v/i, ''),
    url: releaseUrlFor(tag),
    name: typeof obj.name === 'string' ? obj.name.slice(0, 120) : tag,
    publishedAt,
    draft: obj.draft === true,
    prerelease: obj.prerelease === true,
    assets,
    manifestPair: hasManifest && hasManifestSig ? 'pair' : hasManifest || hasManifestSig ? 'half' : 'none'
  }
}

/** The whole availability verdict, as pure data.
 *
 *  Version rule (Nucleus doctrine, product decision): a higher x.y.z always
 *  counts as an update. When the published release carries the SAME x.y.z
 *  (the release ritual can re-ship builds at one version), a strictly newer
 *  published-at timestamp still counts — classified 'build' so the UI can
 *  say "new build" instead of "new version". `appPublishMs` is the caller's
 *  proxy for when THIS running build was made (the install directory's
 *  mtime); with no clock at all there is no claim either way. */
export function decide(
  latest: SanitizedRelease | null,
  localVersion: string,
  appPublishMs: number
): { status: 'none' } | { status: 'up-to-date' } | { status: 'available'; kind: 'version' | 'build' } {
  if (latest === null) return { status: 'none' }
  if (latest.draft || latest.prerelease) return { status: 'none' }
  // An unparseable RUNNING version: we cannot know what we are on, so we
  // cannot claim anything is newer — never push a download blind.
  const local = parseVersionCore(localVersion)
  if (local === null) return { status: 'none' }
  const cmp = compareVersionCores(latest.version, local)
  if (cmp > 0) return { status: 'available', kind: 'version' }
  if (cmp < 0) return { status: 'up-to-date' }
  const publishedMs = Date.parse(latest.publishedAt)
  if (!Number.isFinite(publishedMs) || !Number.isFinite(appPublishMs)) return { status: 'up-to-date' }
  if (publishedMs > appPublishMs) return { status: 'available', kind: 'build' }
  return { status: 'up-to-date' }
}

/**
 * Which published file to hand this install, from the SANITIZED asset list
 * only. An NSIS install takes the setup exe; a portable run (the bootstrapper
 * sets PORTABLE_EXECUTABLE_DIR) takes the portable exe. Preference, never a
 * requirement: within each tier a digest-BOUND asset wins (after the manifest
 * folds in, only assets the SIGNED manifest vouches for carry a sha256),
 * then any match, then any .exe with a digest, then any .exe. With no .exe at
 * all: null — the release page is the fallback either way.
 */
export function chooseAsset(
  release: SanitizedRelease | null,
  wantPortable: boolean
): SanitizedAsset | null {
  if (release === null) return null
  const list = release.assets.filter(a => a.name !== MANIFEST_NAME && a.name !== MANIFEST_SIG_NAME)
  const want = wantPortable ? /-portable\.exe$/i : /-setup\.exe$/i
  return (
    list.find(a => want.test(a.name) && a.sha256 !== null) ||
    list.find(a => want.test(a.name)) ||
    list.find(a => /\.exe$/i.test(a.name) && a.sha256 !== null) ||
    list.find(a => /\.exe$/i.test(a.name)) ||
    null
  )
}

/** A verified manifest's asset record (schema-checked in update-core). */
export interface ManifestAsset {
  readonly name: string
  readonly sha256: string
  readonly size: number | null
}

export interface VerifiedManifest {
  readonly schema: 1
  readonly tag: string
  readonly generatedAt: string
  readonly assets: readonly ManifestAsset[]
}

/**
 * Fold a VERIFIED manifest into the sanitized release: the manifest's digest
 * becomes the only digest a download may match (a different published digest
 * is a contradiction, and the signed manifest wins), and assets the manifest
 * omits lose their digest (nothing trustworthy to match). Pure.
 */
export function applyManifest(
  rel: SanitizedRelease,
  manifest: VerifiedManifest
): SanitizedRelease {
  const byName = new Map(manifest.assets.map(a => [a.name, a]))
  const assets = rel.assets.map(a => {
    const m = byName.get(a.name)
    if (m === undefined) return { ...a, sha256: null }
    return { ...a, sha256: m.sha256 }
  })
  return { ...rel, assets, authenticated: true, authReason: null }
}

/** The notes of a GitHub release JSON, reduced to plain markdown or null. */
export function releaseNotesFrom(json: Record<string, unknown>): string {
  return typeof json.body === 'string' ? json.body : ''
}
