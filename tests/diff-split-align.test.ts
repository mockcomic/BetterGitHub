import { describe, expect, it } from 'vitest'
import { buildSplitRows, parseDiff } from '../src/renderer/src/diff-parse'

/**
 * `git diff --no-ext-diff HEAD -U3 -- base.txt` for a file left conflicted by
 * a merge, on a repo with merge.conflictStyle=zdiff3 (git >= 2.19 also ships
 * diff3; the shape is the same). The added side is the whole marker block, so
 * it is far longer than the deleted side and shares only some of its lines.
 */
const CONFLICT_DIFF = [
  'diff --git a/base.txt b/base.txt',
  'index 2720493..6929825 100644',
  '--- a/base.txt',
  '+++ b/base.txt',
  '@@ -1,6 +1,18 @@',
  ' one',
  '+<<<<<<< HEAD',
  ' zero',
  '+||||||| 66f2e3e',
  '+two',
  '+=======',
  '+TWO-changed',
  '+>>>>>>> feature',
  ' three',
  '-four',
  '-six',
  '+<<<<<<< HEAD',
  '+four',
  '+six',
  '+||||||| 66f2e3e',
  '+four',
  '+=======',
  '+five',
  '+>>>>>>> feature'
].join('\n')

/** The split rows as [left, right] text pairs, for readable assertions. */
function sides(diff: string): Array<[string | null, string | null]> {
  return buildSplitRows(parseDiff(diff)).map(row => {
    if (row.hunk !== undefined) return [`@@ ${row.hunk}`, `@@ ${row.hunk}`]
    return [row.left?.text ?? null, row.right?.text ?? null]
  })
}

describe('split view alignment', () => {
  it('faces identical lines in a conflict block instead of marker noise', () => {
    const rows = sides(CONFLICT_DIFF)
    // Everything up to the first conflict is context or pure addition.
    expect(rows.slice(5)).toEqual([
      ['one', 'one'],
      [null, '<<<<<<< HEAD'],
      ['zero', 'zero'],
      [null, '||||||| 66f2e3e'],
      [null, 'two'],
      [null, '======='],
      [null, 'TWO-changed'],
      [null, '>>>>>>> feature'],
      ['three', 'three'],
      // The block the old code got wrong: `four`/`six` were zipped against
      // `<<<<<<< HEAD`/`four`, leaving `six` orphaned.
      [null, '<<<<<<< HEAD'],
      ['four', 'four'],
      ['six', 'six'],
      [null, '||||||| 66f2e3e'],
      [null, 'four'],
      [null, '======='],
      [null, 'five'],
      [null, '>>>>>>> feature']
    ])
  })

  it('still pairs a plain modification so word diffing applies', () => {
    const rows = sides(
      ['@@ -1,3 +1,3 @@', ' ctx', '-const value = 1', '+const value = 2', ' end'].join(
        '\n'
      )
    )
    expect(rows).toEqual([
      ['@@ @@ -1,3 +1,3 @@', '@@ @@ -1,3 +1,3 @@'],
      ['ctx', 'ctx'],
      ['const value = 1', 'const value = 2'],
      ['end', 'end']
    ])
  })

  it('keeps wholly added or wholly removed blocks single-sided', () => {
    const rows = sides(
      ['@@ -1,1 +1,4 @@', '+first', '+second', ' ctx', '-gone'].join('\n')
    )
    expect(rows.slice(1)).toEqual([
      [null, 'first'],
      [null, 'second'],
      ['ctx', 'ctx'],
      ['gone', null]
    ])
  })

  it('aligns when the two sides merely overlap', () => {
    const rows = sides(
      ['@@ -1,2 +1,3 @@', '-k0', '-k1', '+pad', '+k0', '+k1'].join('\n')
    )
    expect(rows.slice(1)).toEqual([
      [null, 'pad'],
      ['k0', 'k0'],
      ['k1', 'k1']
    ])
  })

  it('falls back to positional pairing for blocks too large to align', () => {
    // 600 x 601 is past the alignment budget, so the leading `pad` addition
    // stays zipped against the first deletion instead of sliding right.
    const dels = Array.from({ length: 600 }, (_, i) => `-${i}`)
    const adds = ['+pad', ...Array.from({ length: 600 }, (_, i) => `+${i}`)]
    const rows = sides(['@@ -1,600 +1,601 @@', ...dels, ...adds].join('\n'))
    expect(rows[1]).toEqual(['0', 'pad'])
  })
})

describe('word-level annotation after alignment', () => {
  it('does not compare old content against a conflict marker', () => {
    const lines = parseDiff(CONFLICT_DIFF)
    const del = lines.find(l => l.kind === 'del' && l.text === 'four')
    expect(del?.segments).toBeUndefined()
    const add = lines.find(l => l.kind === 'add' && l.text === 'four')
    expect(add?.segments).toBeUndefined()
  })

  it('annotates the lines that really pair up', () => {
    const lines = parseDiff(
      ['@@ -1,2 +1,2 @@', '-const value = 1', '+const value = 2'].join('\n')
    )
    const del = lines.find(l => l.kind === 'del')
    expect(del?.segments?.map(s => s.text)).toEqual(['const value = ', '1'])
    expect(del?.segments?.[1]?.changed).toBe(true)
  })
})
