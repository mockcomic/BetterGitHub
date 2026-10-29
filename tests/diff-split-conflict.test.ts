import { mkdtempSync } from 'fs'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { execGit } from '../src/main/git/exec'
import { getPathDiff } from '../src/main/git/diff'
import { buildSplitRows, parseDiff } from '../src/renderer/src/diff-parse'

/**
 * End-to-end for the split view of a conflicted file: makes a real merge
 * conflict, asks the app's own diff verb for the payload, and checks how the
 * splitter lays that payload out. Positional pairing used to line the old
 * lines up against conflict-marker noise, so the two windows disagreed about
 * which line a change was.
 */

let repo = ''

async function git(args: ReadonlyArray<string>): Promise<string> {
  const r = await execGit(args, {
    cwd: repo,
    timeoutMs: 30_000,
    // `git merge` reports a failed merge as exit 1, which this test expects.
    successExitCodes: new Set([0, 1])
  })
  return (r.stdout + r.stderr).trim()
}

async function writeAndCommit(
  path: string,
  content: string,
  message: string
): Promise<void> {
  await writeFile(join(repo, path), content, 'utf8')
  await execGit(['add', '--', path], { cwd: repo })
  await execGit(['commit', '--quiet', '--no-verify', '-m', message], { cwd: repo })
}

beforeAll(async () => {
  repo = mkdtempSync(join(tmpdir(), 'gitdesk-conflict-split-'))
  await git(['init', '--quiet', '--initial-branch=main', repo])
  await git(['config', 'user.name', 'GitDesk Test'])
  await git(['config', 'user.email', 'test@example.com'])
  // The app inherits the developer's conflict style, so pin the one that adds
  // a base section: it puts the most marker lines in the diff, and that is
  // exactly where positional alignment did the most damage.
  await git(['config', 'merge.conflictStyle', 'zdiff3'])

  await writeAndCommit('base.txt', 'one\ntwo\nthree\nfour\n', 'init')
  await git(['checkout', '--quiet', '-b', 'feature'])
  await writeAndCommit('base.txt', 'one\nTWO-changed\nthree\nfive\n', 'feature change')
  await git(['checkout', '--quiet', 'main'])
  await writeAndCommit('base.txt', 'one\nzero\nthree\nfour\nsix\n', 'main change')

  await git(['merge', 'feature'])
  expect(await git(['status', '--short'])).toContain('UU base.txt')
})

const MARKERS = ['<<<<<<<', '|||||||', '=======', '>>>>>>>']

describe('split rows for a real conflicted file', () => {
  it('faces the old lines with the file lines they match, markers alone', async () => {
    const diff = await getPathDiff(repo, 'base.txt')
    expect(diff).toContain('<<<<<<< HEAD')

    const rows = buildSplitRows(parseDiff(diff))
      .filter(r => r.hunk === undefined)
      .map(r => `${r.left?.text ?? ''}\u0000${r.right?.text ?? ''}`)

    // A marker line is a pure addition, so it may only ever sit alone on the
    // right — never opposite an old line.
    for (const row of rows) {
      const [left, right] = row.split('\u0000')
      for (const marker of MARKERS) {
        if (right.startsWith(marker)) expect(left).toBe('')
        if (left.startsWith(marker)) expect(right).toBe('')
      }
    }

    // The lines the old code orphaned: HEAD's `four` and `six` now face the
    // same lines held inside the HEAD side of the markers.
    expect(rows).toContain('four\u0000four')
    expect(rows).toContain('six\u0000six')
    expect(rows).toContain('\u0000<<<<<<< HEAD')
  })
})
