import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { detectPackageManager, getPackageScripts, parsePackageScripts } from '../src/main/package-scripts'
import { scriptCommandLine } from '../src/shared/scripts'

/**
 * The Scripts desk's whole read side: parsePackageScripts and
 * detectPackageManager are pure; getPackageScripts runs against real
 * temporary folders (one package.json, one lockfile each) with the
 * repository guard mocked, exactly like terminal.test.ts mocks its seams.
 */

vi.mock('../src/main/git/sync', () => ({
  verifyRepository: vi.fn(async () => {})
}))

describe('parsePackageScripts', () => {
  it('keeps string-valued entries in file order', () => {
    const json = JSON.stringify({
      name: 'x',
      scripts: { dev: 'vite', build: 'vite build', n: 4, skip: null }
    })
    expect(parsePackageScripts(json)).toEqual({
      scripts: [
        { name: 'dev', command: 'vite' },
        { name: 'build', command: 'vite build' }
      ],
      error: null
    })
  })

  it('answers an empty list for a file with no scripts', () => {
    expect(parsePackageScripts('{"name":"x"}')).toEqual({ scripts: [], error: null })
    expect(parsePackageScripts('{"scripts":{}}')).toEqual({ scripts: [], error: null })
  })

  it('reports malformed JSON as data, not a throw', () => {
    const parsed = parsePackageScripts('{ oops')
    expect(parsed.scripts).toEqual([])
    expect(parsed.error).toMatch(/not valid JSON/)
  })

  it('rejects a non-object scripts value', () => {
    const parsed = parsePackageScripts('{"scripts":[]}')
    expect(parsed.scripts).toEqual([])
    expect(parsed.error).toMatch(/scripts/)
  })
})

describe('detectPackageManager', () => {
  it('defaults to npm when no lockfile is present', () => {
    expect(detectPackageManager(new Set([]))).toBe('npm')
    expect(detectPackageManager(new Set(['README.md']))).toBe('npm')
  })

  it('honours each single lockfile', () => {
    expect(detectPackageManager(new Set(['package-lock.json']))).toBe('npm')
    expect(detectPackageManager(new Set(['yarn.lock']))).toBe('yarn')
    expect(detectPackageManager(new Set(['pnpm-lock.yaml']))).toBe('pnpm')
    expect(detectPackageManager(new Set(['bun.lock']))).toBe('bun')
    expect(detectPackageManager(new Set(['bun.lockb']))).toBe('bun')
  })

  it('prefers the most specific when a migrated repo keeps several', () => {
    expect(
      detectPackageManager(
        new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'])
      )
    ).toBe('pnpm')
    expect(detectPackageManager(new Set(['yarn.lock', 'package-lock.json']))).toBe('yarn')
  })
})

describe('scriptCommandLine', () => {
  it('types the plain verb for ordinary names', () => {
    expect(scriptCommandLine({ manager: 'npm' }, 'dev')).toBe('npm run dev')
    expect(scriptCommandLine({ manager: 'pnpm' }, 'build')).toBe('pnpm run build')
    expect(scriptCommandLine({ manager: 'yarn' }, 'lint')).toBe('yarn run lint')
    expect(scriptCommandLine({ manager: 'bun' }, 'test')).toBe('bun run test')
    expect(scriptCommandLine({ manager: 'npm' }, 'dist:win')).toBe('npm run dist:win')
  })

  it('quotes a name a shell would otherwise split', () => {
    expect(scriptCommandLine({ manager: 'npm' }, 'build: win')).toBe('npm run "build: win"')
  })
})

describe('getPackageScripts', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'aspen-scripts-'))
  })
  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function repo(files: Readonly<Record<string, string>>): Promise<string> {
    const dir = await mkdtemp(join(root, 'r-'))
    for (const [name, contents] of Object.entries(files)) {
      await mkdir(join(dir, name, '..'), { recursive: true }).catch(() => undefined)
      await writeFile(join(dir, name), contents, 'utf8')
    }
    return dir
  }

  it('reads scripts and the lockfile manager together', async () => {
    const dir = await repo({
      'package.json': '{"scripts":{"dev":"vite","dist":"vite build"}}',
      'pnpm-lock.yaml': 'lockfileVersion: 9'
    })
    expect(await getPackageScripts(dir)).toEqual({
      manager: 'pnpm',
      scripts: [
        { name: 'dev', command: 'vite' },
        { name: 'dist', command: 'vite build' }
      ],
      error: null
    })
  })

  it('treats a missing package.json as no scripts, not an error', async () => {
    const dir = await repo({ 'README.md': 'hi' })
    expect(await getPackageScripts(dir)).toEqual({
      manager: 'npm',
      scripts: [],
      error: null
    })
  })

  it('surfaces a malformed package.json as the section’s inline error', async () => {
    const dir = await repo({ 'package.json': '{oops' })
    const result = await getPackageScripts(dir)
    expect(result.scripts).toEqual([])
    expect(result.error).toMatch(/not valid JSON/)
  })
})
