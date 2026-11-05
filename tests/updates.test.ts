import { describe, expect, it } from 'vitest'
import {
  isVersionNewer,
  parseReleaseJson,
  parseVersionCore
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

describe('parseReleaseJson', () => {
  it('maps a real-shaped release payload', () => {
    const info = parseReleaseJson({
      tag_name: 'v0.2.0',
      name: 'Aspen 0.2.0',
      html_url: 'https://github.com/mockcomic/BetterGitHub/releases/tag/v0.2.0',
      body: '## What changed\n- self-update\n',
      draft: false,
      prerelease: false
    })
    expect(info).not.toBeNull()
    expect(info?.version).toBe('0.2.0')
    expect(info?.url).toBe(
      'https://github.com/mockcomic/BetterGitHub/releases/tag/v0.2.0'
    )
    expect(info?.notes).toContain('self-update')
  })

  it('defaults notes to empty for a body-less release', () => {
    const info = parseReleaseJson({
      tag_name: '0.2.0',
      html_url: 'https://example.test/releases/tag/0.2.0'
    })
    expect(info?.notes).toBe('')
  })

  it('rejects payloads without usable tag or url fields', () => {
    expect(parseReleaseJson({})).toBeNull()
    expect(parseReleaseJson({ tag_name: 'nightly', html_url: 'https://x.test' })).toBeNull()
    expect(
      parseReleaseJson({ tag_name: 123, html_url: 'https://x.test' })
    ).toBeNull()
    expect(parseReleaseJson({ tag_name: 'v1.0.0', html_url: 42 })).toBeNull()
  })

  it('keeps a blank html_url from becoming an empty page link', () => {
    const info = parseReleaseJson({ tag_name: 'v1.0.0', html_url: '   ' })
    // Whitespace-only URL still passes the string check; the fallback keeps
    // the link pointing somewhere real.
    expect(info?.url.trim().length === 0).toBe(false)
  })
})
