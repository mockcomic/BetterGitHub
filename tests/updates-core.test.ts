/**
 * update-core: the security invariants of the Nucleus-style self-update,
 * exercised without Electron or the network — fake fetch responses, a real
 * temp directory, an injected spawn, and an ephemeral signing keypair.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createHash, generateKeyPairSync, sign as edSign } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _reset,
  check,
  configure,
  download,
  runInstaller,
  snapshot,
  verifyManifest
} from '../src/main/update-core'

const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})

const DL = 'https://github.com/mockcomic/BetterGitHub/releases/download/v9.9.9'

function manifestBytes(assets: { name: string; sha256: string; size: number }[]): Buffer {
  const manifest = {
    schema: 1,
    repo: 'mockcomic/BetterGitHub',
    tag: 'v9.9.9',
    generatedAt: new Date().toISOString(),
    nonce: 'test-nonce',
    assets
  }
  return Buffer.from(JSON.stringify(manifest, null, 1) + '\n', 'utf8')
}

function signBytes(bytes: Buffer): string {
  return edSign(null, bytes, privateKey).toString('base64')
}

/** A fake Response over fixed bytes (or JSON text) whose final `url` is
 *  pinned — Response#url is read-only on the real class, so it is defined
 *  after construction. `ok:false` stands in for an HTTP failure status. */
function fakeResponse(
  body: Uint8Array | string,
  url: string,
  opts: { ok?: boolean; status?: number } = {}
): Response {
  const okFlag = opts.ok ?? true
  const status = opts.status ?? (okFlag ? 200 : 500)
  const data = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  const res = new Response(new Uint8Array(data), { status })
  if (!okFlag) Object.defineProperty(res, 'ok', { value: false })
  Object.defineProperty(res, 'url', { value: url })
  return res
}

type FetchStub = (url: string, init?: unknown) => Promise<Response>

/** Map one update-check round trip: release JSON at the API URL, then
 *  whichever asset bytes the URL asks for (missing asset -> HTTP 500). */
function fetchRouter(releaseJson: unknown, assets: Record<string, Uint8Array>): FetchStub {
  return async (url: string): Promise<Response> => {
    if (url.includes('/releases/latest')) {
      return fakeResponse(JSON.stringify(releaseJson), url)
    }
    const name = url.slice(url.lastIndexOf('/') + 1)
    const bytes = assets[name]
    if (bytes === undefined) return fakeResponse(new Uint8Array(), url, { ok: false })
    return fakeResponse(bytes, url)
  }
}

let dir: string
beforeEach(() => {
  _reset()
  configure(null)
  dir = mkdtempSync(join(tmpdir(), 'aspen-update-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('verifyManifest', () => {
  it('accepts a manifest signed with the trusted key', () => {
    const bytes = manifestBytes([{ name: 'Aspen-Setup.exe', sha256: 'a'.repeat(64), size: 10 }])
    const v = verifyManifest(bytes, signBytes(bytes), 'v9.9.9', { keyPem: publicKey })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.manifest.assets[0].name).toBe('Aspen-Setup.exe')
  })

  it('rejects a tampered manifest', () => {
    const bytes = manifestBytes([{ name: 'Aspen-Setup.exe', sha256: 'a'.repeat(64), size: 10 }])
    const sig = signBytes(bytes)
    const tampered = Buffer.from(bytes.toString('utf8').replace('Aspen-Setup', 'Evil-Setup'), 'utf8')
    const v = verifyManifest(tampered, sig, 'v9.9.9', { keyPem: publicKey })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toMatch(/does not verify/)
  })

  it('fails closed with no key at all', () => {
    const bytes = manifestBytes([{ name: 'a.exe', sha256: 'a'.repeat(64), size: 1 }])
    const v = verifyManifest(bytes, signBytes(bytes), 'v9.9.9', { keyPem: null })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toMatch(/no signing key/)
  })

  it('rejects a manifest signed for a different tag', () => {
    const bytes = manifestBytes([{ name: 'a.exe', sha256: 'a'.repeat(64), size: 1 }])
    const v = verifyManifest(bytes, signBytes(bytes), 'v1.0.0', { keyPem: publicKey })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toMatch(/different release/)
  })

  it('rejects a malformed signature', () => {
    const bytes = manifestBytes([{ name: 'a.exe', sha256: 'a'.repeat(64), size: 1 }])
    const v = verifyManifest(bytes, 'not base64!!', 'v9.9.9', { keyPem: publicKey })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toMatch(/malformed/)
  })
})

/* ------------------------- check: auth verdicts --------------------------- */

const exeBytes = Buffer.from('installer-bytes')
const exeSha = createHash('sha256').update(exeBytes).digest('hex')

function releaseJson(withPair: boolean): unknown {
  const assets: Record<string, unknown>[] = [
    {
      name: 'Aspen-Setup.exe',
      browser_download_url: `${DL}/Aspen-Setup.exe`,
      size: exeBytes.length,
      digest: 'sha256:' + exeSha
    }
  ]
  if (withPair) {
    assets.push({ name: 'update-manifest.json', browser_download_url: `${DL}/update-manifest.json` })
    assets.push({ name: 'update-manifest.json.sig', browser_download_url: `${DL}/update-manifest.json.sig` })
  }
  return {
    tag_name: 'v9.9.9',
    published_at: new Date(Date.now() + 86_400_000).toISOString(),
    draft: false,
    prerelease: false,
    assets
  }
}

/** A build from yesterday: v9.9.9 published tomorrow is strictly newer. */
const oneDayAgo = () => Date.now() - 86_400_000

describe('check', () => {
  it('a verifying manifest pair authenticates the release', async () => {
    const mBytes = manifestBytes([{ name: 'Aspen-Setup.exe', sha256: exeSha, size: exeBytes.length }])
    const fetchImpl = fetchRouter(releaseJson(true), {
      'update-manifest.json': mBytes,
      'update-manifest.json.sig': Buffer.from(signBytes(mBytes), 'utf8')
    })
    const res = await check({
      appVersion: '0.1.0',
      appPublishMs: oneDayAgo(),
      fetchImpl,
      verifyKeyPem: publicKey
    })
    expect(res).toEqual({ ok: true, status: 'available', kind: 'version' })
    const snap = snapshot('0.1.0', oneDayAgo())
    expect(snap.release?.authenticated).toBe(true)
    expect(snap.release?.assets.find(a => a.name === 'Aspen-Setup.exe')?.sha256).toBe(exeSha)
  })

  it('no pair at all: offered but browse-only (fail closed)', async () => {
    const fetchImpl = fetchRouter(releaseJson(false), {})
    const res = await check({ appVersion: '0.1.0', appPublishMs: oneDayAgo(), fetchImpl })
    expect(res.status).toBe('available')
    const snap = snapshot('0.1.0', oneDayAgo())
    expect(snap.release?.authenticated).toBe(false)
    expect(snap.release?.authReason).toBe('no manifest')
  })

  it('a manifest fetch failure degrades to browse-only, never an error', async () => {
    const mBytes = manifestBytes([{ name: 'Aspen-Setup.exe', sha256: exeSha, size: exeBytes.length }])
    const fetchImpl = fetchRouter(releaseJson(true), {
      'update-manifest.json': mBytes
      // .sig deliberately missing -> HTTP 500
    })
    const res = await check({ appVersion: '0.1.0', appPublishMs: oneDayAgo(), fetchImpl })
    expect(res.status).toBe('available')
    expect(snapshot('0.1.0', oneDayAgo()).release?.authenticated).toBe(false)
  })

  it('a network failure reports error', async () => {
    const boom: FetchStub = async () => {
      throw new Error('offline')
    }
    const res = await check({ appVersion: '0.1.0', fetchImpl: boom })
    expect(res.status).toBe('error')
    expect(res.error).toMatch(/offline/)
  })

  it('the cache round-trips through configure() and re-sanitizes', async () => {
    configure(dir)
    const mBytes = manifestBytes([{ name: 'Aspen-Setup.exe', sha256: exeSha, size: exeBytes.length }])
    const fetchImpl = fetchRouter(releaseJson(true), {
      'update-manifest.json': mBytes,
      'update-manifest.json.sig': Buffer.from(signBytes(mBytes), 'utf8')
    })
    await check({ appVersion: '0.1.0', appPublishMs: oneDayAgo(), fetchImpl, verifyKeyPem: publicKey })
    expect(existsSync(join(dir, 'update-info.json'))).toBe(true)
    // Fresh boot: the cache loads, the release is known, but authenticated
    // does NOT survive it — read-back is data, not authority until the next
    // check re-verifies the manifest (seconds after launch).
    _reset()
    configure(dir)
    const snap = snapshot('0.1.0', oneDayAgo())
    expect(snap.release?.tag).toBe('v9.9.9')
    expect(snap.release?.authenticated).toBeUndefined()
  })
})

/* ------------------------------- download --------------------------------- */

describe('download', () => {
  const body = Buffer.from('MZ installer payload')
  const sha = createHash('sha256').update(body).digest('hex')
  const asset = {
    name: 'Aspen-Setup.exe',
    url: `${DL}/Aspen-Setup.exe`,
    size: body.length,
    sha256: sha
  }

  it('refuses an unauthenticated release before touching the network', async () => {
    let touched = false
    const res = await download({
      asset,
      authenticated: false,
      destDir: dir,
      fetchImpl: (async () => {
        touched = true
        return new Response()
      }) as FetchStub
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/not authenticated/)
    expect(touched).toBe(false)
  })

  it('refuses an asset with no digest', async () => {
    const res = await download({
      asset: { ...asset, sha256: null },
      authenticated: true,
      destDir: dir,
      fetchImpl: (async () => new Response()) as FetchStub
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/checksum/)
  })

  it('streams to the destination, verifies, and arms runInstaller', async () => {
    const progress: number[] = []
    const res = await download({
      asset,
      authenticated: true,
      destDir: dir,
      fetchImpl: (async (url: string) => fakeResponse(body, url)) as FetchStub,
      onProgress: p => {
        if (p.pct !== null) progress.push(p.pct)
      }
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(readFileSync(res.path)).toEqual(body)
      expect(res.sha256).toBe(sha)
      expect(progress).toContain(100)
      let spawned: string | null = null
      const r = runInstaller(res.path, {
        spawnImpl: ((cmd: string) => {
          spawned = cmd
          return { unref: () => undefined }
        }) as never
      })
      expect(r.ok).toBe(true)
      expect(spawned).toBe(res.path)
    }
  })

  it('rejects a checksum mismatch and cleans up the .part', async () => {
    const res = await download({
      asset,
      authenticated: true,
      destDir: dir,
      fetchImpl: (async (url: string) =>
        fakeResponse(Buffer.from('different bytes'), url)) as FetchStub
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/checksum mismatch/)
    expect(existsSync(join(dir, 'Aspen-Setup.exe.part'))).toBe(false)
  })

  it('rejects a redirect that leaves the update hosts', async () => {
    const res = await download({
      asset,
      authenticated: true,
      destDir: dir,
      fetchImpl: (async () => fakeResponse(body, 'https://evil.test/x.exe')) as FetchStub
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/left the update hosts/)
  })

  it('enforces the byte cap during the transfer', async () => {
    const res = await download({
      asset,
      authenticated: true,
      destDir: dir,
      maxBytes: 4,
      fetchImpl: (async (url: string) => fakeResponse(body, url)) as FetchStub
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/byte cap/)
  })
})

describe('runInstaller', () => {
  it('refuses a path this module never verified', () => {
    const r = runInstaller(join(dir, 'random.exe'), {
      spawnImpl: (() => {
        throw new Error('spawned!')
      }) as never
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/never verified/)
  })

  it('refuses a path that is not an exe', () => {
    expect(runInstaller('/tmp/whatever.txt').ok).toBe(false)
  })
})
