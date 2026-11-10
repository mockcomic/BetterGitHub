import { describe, expect, it } from 'vitest'
import {
  chooseAsset,
  decide,
  isVersionNewer,
  parseVersionCore,
  sanitizeRelease
} from '../src/shared/updates'

describe('parseVersionCore', () => {
  it('accepts bare and v-prefixed triples', () => {
    expect(parseVersionCore('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 })
    expect(parseVersionCore('v12.3.45')).toEqual({ major: 12, minor: 3, patch: 45 })
  })

  it('accepts prerelease/build suffixes on the core', () => {
    expect(parseVersionCore('v1.2.3-beta.1')).toEqual({ major: 1, minor: 2, patch: 3 })
    expect(parseVersionCore('1.2.3+build.9')).toEqual({ major: 1, minor: 2, patch: 3 })
  })

  it('survives surrounding whitespace', () => {
    expect(parseVersionCore('  v0.2.0 ')).toEqual({ major: 0, minor: 2, patch: 0 })
  })

  it('rejects anything that does not name a stable triple', () => {
    expect(parseVersionCore('v1.2')).toBeNull()
    expect(parseVersionCore('1')).toBeNull()
    expect(parseVersionCore('nightly')).toBeNull()
    expect(parseVersionCore('')).toBeNull()
    // Absurd widths must not silently become huge numbers.
    expect(parseVersionCore('99999999999999999999.0.0')).toBeNull()
  })
})

describe('isVersionNewer', () => {
  it('finds strictly newer patch/minor/major releases', () => {
    expect(isVersionNewer('0.1.0', '0.1.1')).toBe(true)
    expect(isVersionNewer('0.1.9', '0.2.0')).toBe(true)
    expect(isVersionNewer('1.9.9', '2.0.0')).toBe(true)
  })

  it('treats the v prefix as noise', () => {
    expect(isVersionNewer('0.1.0', 'v0.2.0')).toBe(true)
    expect(isVersionNewer('v0.2.0', '0.1.0')).toBe(false)
  })

  it('is not newer for equal versions, older candidates, or equal cores with a prerelease suffix', () => {
    expect(isVersionNewer('0.1.0', '0.1.0')).toBe(false)
    expect(isVersionNewer('0.2.0', '0.1.0')).toBe(false)
    // 0.1.0-beta.1 names the same release core; promoting a beta onto a
    // stable install is not an update.
    expect(isVersionNewer('0.1.0', '0.1.0-beta.1')).toBe(false)
  })

  it('never pushes a malformed candidate', () => {
    expect(isVersionNewer('0.1.0', 'garbage')).toBe(false)
    expect(isVersionNewer('garbage', '0.2.0')).toBe(false)
    expect(isVersionNewer('', '0.2.0')).toBe(false)
  })

  it('rolls over single-digit components numerically, not lexically', () => {
    expect(isVersionNewer('0.9.0', '0.10.0')).toBe(true)
    expect(isVersionNewer('0.1.9', '0.1.10')).toBe(true)
  })
})

describe('sanitizeRelease', () => {
  const DL = 'https://github.com/mockcomic/BetterGitHub/releases/download/v0.2.0'

  it('maps a real-shaped GitHub release payload', () => {
    const rel = sanitizeRelease({
      tag_name: 'v0.2.0',
      name: 'Aspen 0.2.0',
      published_at: '2026-05-01T00:00:00Z',
      draft: false,
      prerelease: false,
      assets: [
        { name: 'Aspen-Setup.exe', browser_download_url: `${DL}/Aspen-Setup.exe`, size: 100, digest: 'sha256:' + 'a'.repeat(64) },
        { name: 'update-manifest.json', browser_download_url: `${DL}/update-manifest.json` },
        { name: 'update-manifest.json.sig', browser_download_url: `${DL}/update-manifest.json.sig` }
      ]
    })
    expect(rel).not.toBeNull()
    expect(rel?.tag).toBe('v0.2.0')
    expect(rel?.versionLabel).toBe('0.2.0')
    expect(rel?.url).toBe('https://github.com/mockcomic/BetterGitHub/releases/tag/v0.2.0')
    expect(rel?.manifestPair).toBe('pair')
    expect(rel?.assets[0].sha256).toBe('a'.repeat(64))
  })

  it('round-trips its own sanitized shape (the update-info.json cache path)', () => {
    const first = sanitizeRelease({
      tag_name: 'v0.3.1',
      published_at: '2026-06-01T00:00:00Z',
      assets: [{ name: 'Aspen-Setup.exe', browser_download_url: `${DL}/Aspen-Setup.exe`, sha256: 'b'.repeat(64) }]
    })
    const again = sanitizeRelease(first)
    expect(again).not.toBeNull()
    expect(again?.tag).toBe('v0.3.1')
    expect(again?.assets[0].sha256).toBe('b'.repeat(64))
  })

  it('rejects a payload with no usable tag or no date', () => {
    expect(sanitizeRelease({})).toBeNull()
    expect(sanitizeRelease({ tag_name: 'bad tag!', published_at: '2026-01-01T00:00:00Z' })).toBeNull()
    expect(sanitizeRelease({ tag_name: 'v1.0.0' })).toBeNull()
    expect(sanitizeRelease({ tag_name: 'v1.0.0', published_at: 'not-a-date' })).toBeNull()
    // A tag-shaped string that is not a version survives sanitizing with a
    // null core — decide() then treats it as "never newer", not as garbage.
    const nightly = sanitizeRelease({ tag_name: 'nightly', published_at: '2026-01-01T00:00:00Z' })
    expect(nightly?.version).toBeNull()
  })

  it('drops assets whose URL leaves the pinned hosts', () => {
    const rel = sanitizeRelease({
      tag_name: 'v1.0.0',
      published_at: '2026-01-01T00:00:00Z',
      assets: [
        { name: 'evil.exe', browser_download_url: 'http://github.com/mockcomic/BetterGitHub/releases/download/v1.0.0/evil.exe' },
        { name: 'stranger.exe', browser_download_url: 'https://evil.test/setup.exe' },
        { name: 'ok.exe', browser_download_url: `${DL}/ok.exe` }
      ]
    })
    expect(rel?.assets.map(a => a.name)).toEqual(['ok.exe'])
  })

  it('flags a half manifest pair (fails closed like a bad signature)', () => {
    const rel = sanitizeRelease({
      tag_name: 'v1.0.0',
      published_at: '2026-01-01T00:00:00Z',
      assets: [{ name: 'update-manifest.json', browser_download_url: `${DL}/update-manifest.json` }]
    })
    expect(rel?.manifestPair).toBe('half')
  })
})

describe('decide', () => {
  const rel = (tag: string, publishedAt = '2026-01-01T00:00:00Z') =>
    sanitizeRelease({ tag_name: tag, published_at: publishedAt })!

  it('a strictly newer version is a version update', () => {
    expect(decide(rel('v0.2.0'), '0.1.0', Date.parse('2026-02-01'))).toEqual({ status: 'available', kind: 'version' })
  })

  it('an older release is up-to-date', () => {
    expect(decide(rel('v0.1.0'), '0.2.0', 0)).toEqual({ status: 'up-to-date' })
  })

  it('the same version with a newer publish date is a build update', () => {
    expect(decide(rel('v0.2.0', '2026-05-01T00:00:00Z'), '0.2.0', Date.parse('2026-04-01'))).toEqual({
      status: 'available',
      kind: 'build'
    })
  })

  it('the same version with no build clock is up-to-date (no claim)', () => {
    expect(decide(rel('v0.2.0', '2026-05-01T00:00:00Z'), '0.2.0', NaN)).toEqual({ status: 'up-to-date' })
  })

  it('a null release is nothing to show', () => {
    expect(decide(null, '0.1.0', 0)).toEqual({ status: 'none' })
  })

  it('a prerelease or draft is nothing to show', () => {
    const pre = sanitizeRelease({ tag_name: 'v9.9.9', published_at: '2026-01-01T00:00:00Z', prerelease: true })!
    expect(decide(pre, '0.1.0', 0)).toEqual({ status: 'none' })
  })
})

describe('chooseAsset', () => {
  const DL = 'https://github.com/mockcomic/BetterGitHub/releases/download/v1.0.0'
  const rel = sanitizeRelease({
    tag_name: 'v1.0.0',
    published_at: '2026-01-01T00:00:00Z',
    assets: [
      { name: 'update-manifest.json', browser_download_url: `${DL}/update-manifest.json` },
      { name: 'Aspen-Setup.exe', browser_download_url: `${DL}/Aspen-Setup.exe`, sha256: 'c'.repeat(64) },
      { name: 'Aspen-portable.exe', browser_download_url: `${DL}/Aspen-portable.exe` }
    ]
  })!

  it('prefers the setup exe with a digest for an installed run', () => {
    expect(chooseAsset(rel, false)?.name).toBe('Aspen-Setup.exe')
  })

  it('prefers the portable exe for a portable run', () => {
    expect(chooseAsset(rel, true)?.name).toBe('Aspen-portable.exe')
  })

  it('never hands back a manifest file, and null with no exe at all', () => {
    const docsOnly = sanitizeRelease({
      tag_name: 'v1.0.0',
      published_at: '2026-01-01T00:00:00Z',
      assets: [{ name: 'update-manifest.json', browser_download_url: `${DL}/update-manifest.json` }]
    })!
    expect(chooseAsset(docsOnly, false)).toBeNull()
  })
})
