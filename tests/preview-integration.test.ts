import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { execGit } from '../src/main/git/exec'
import { getPreview, PREVIEW_SIZE_LIMIT } from '../src/main/git/preview'

/**
 * Integration coverage for the media-preview reader: real `git` in a
 * throwaway repository, exercising the working-tree and `git cat-file`
 * paths with actual binary bytes.
 */

// 1x1 red pixel PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==',
  'base64'
)

let repo = ''
let pngSha = ''

function git(args: ReadonlyArray<string>): Promise<string> {
  return execGit(args, { cwd: repo, timeoutMs: 30_000 }).then(r => r.stdout.trim())
}

beforeAll(async () => {
  repo = mkdtempSync(join(tmpdir(), 'gitdesk-preview-'))
  mkdirSync(join(repo, 'assets'))
  writeFileSync(join(repo, 'assets', 'dot.png'), PNG)
  writeFileSync(join(repo, 'notes.txt'), 'hello\n')
  await git(['init', '-q', '-b', 'main'])
  await git(['config', 'user.name', 'Test'])
  await git(['config', 'user.email', 'test@example.com'])
  await git(['config', 'core.autocrlf', 'false'])
  await git(['add', '.'])
  await git(['commit', '-q', '-m', 'media'])
  pngSha = await git(['rev-parse', 'HEAD'])
})

describe('getPreview', () => {
  it('returns working-tree bytes for an image', async () => {
    const preview = await getPreview(repo, 'assets/dot.png')
    expect(preview).not.toBeNull()
    expect(preview!.kind).toBe('image')
    expect(preview!.mime).toBe('image/png')
    expect(preview!.byteLength).toBe(PNG.byteLength)
    expect(Buffer.from(preview!.data!).equals(PNG)).toBe(true)
  })

  it('returns the committed blob for a given sha, byte-exact', async () => {
    // Clobber the working-tree copy; the commit must still read clean.
    writeFileSync(join(repo, 'assets', 'dot.png'), 'not a png anymore')
    const preview = await getPreview(repo, 'assets/dot.png', pngSha)
    expect(preview).not.toBeNull()
    expect(Buffer.from(preview!.data!).equals(PNG)).toBe(true)

    const worktree = await getPreview(repo, 'assets/dot.png')
    expect(Buffer.from(worktree!.data!).equals(PNG)).toBe(false)
    writeFileSync(join(repo, 'assets', 'dot.png'), PNG)
  })

  it('is null for non-media files and missing paths', async () => {
    expect(await getPreview(repo, 'notes.txt')).toBeNull()
    expect(await getPreview(repo, 'gone.png')).toBeNull()
    expect(await getPreview(repo, 'assets/dot.png', '0'.repeat(40))).toBeNull()
  })

  it('refuses files over the size limit without reading them', async () => {
    const big = Buffer.alloc(PREVIEW_SIZE_LIMIT + 1)
    PNG.copy(big)
    writeFileSync(join(repo, 'big.png'), big)
    const worktree = await getPreview(repo, 'big.png')
    expect(worktree).not.toBeNull()
    expect(worktree!.byteLength).toBe(big.byteLength)
    expect(worktree!.data).toBeUndefined()

    await git(['add', 'big.png'])
    await git(['commit', '-q', '-m', 'big'])
    const atTip = await getPreview(repo, 'big.png', await git(['rev-parse', 'HEAD']))
    expect(atTip!.byteLength).toBe(big.byteLength)
    expect(atTip!.data).toBeUndefined()
  })
})
