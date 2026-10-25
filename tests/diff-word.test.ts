import { describe, expect, it } from 'vitest'
import { parseDiff, tokenizeForDiff } from '../src/renderer/src/diff-parse'

const DIFF = [
  'diff --git a/a.ts b/a.ts',
  'index 111..222 100644',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -1,3 +1,3 @@',
  ' context line',
  '-const value = 1',
  '+const value = 2',
  ' trailing'
].join('\n')

describe('parseDiff word-level annotation', () => {
  it('marks only the characters that actually differ', () => {
    const lines = parseDiff(DIFF)
    const del = lines.find(l => l.kind === 'del')
    const add = lines.find(l => l.kind === 'add')

    expect(del?.segments).toBeDefined()
    expect(add?.segments).toBeDefined()

    // Reconstruction must reproduce the original line text exactly.
    expect(del?.segments?.map(s => s.text).join('')).toBe('const value = 1')
    expect(add?.segments?.map(s => s.text).join('')).toBe('const value = 2')

    const changedDel = del?.segments?.filter(s => s.changed) ?? []
    expect(changedDel.map(s => s.text)).toEqual(['1'])
    const changedAdd = add?.segments?.filter(s => s.changed) ?? []
    expect(changedAdd.map(s => s.text)).toEqual(['2'])

    // The unchanged prefix must not be flagged.
    expect(del?.segments?.[0]).toEqual({ text: 'const value = ', changed: false })
  })

  it('leaves unpaired additions and deletions unannotated', () => {
    const lines = parseDiff(
      ['@@ -1,2 +1,3 @@', '-only removed', ' context', '+only added'].join('\n')
    )
    expect(lines.find(l => l.kind === 'del')?.segments).toBeUndefined()
    expect(lines.find(l => l.kind === 'add')?.segments).toBeUndefined()
  })

  it('tracks old/new line numbers across hunks', () => {
    const lines = parseDiff(DIFF)
    const add = lines.find(l => l.kind === 'add')
    const del = lines.find(l => l.kind === 'del')
    expect(del?.oldNo).toBe(2)
    expect(add?.newNo).toBe(2)
  })

  it('collapses a binary diff to its meta lines', () => {
    const lines = parseDiff(
      'diff --git a/x.png b/x.png\nindex 3..4 100644\nBinary files a/x.png and b/x.png differ\n'
    )
    expect(lines.every(l => l.kind === 'meta' || l.kind === 'warning')).toBe(true)
  })
})

describe('tokenizeForDiff', () => {
  it('splits into words, punctuation and whitespace runs', () => {
    expect(tokenizeForDiff('ab (1)  x')).toEqual(['ab', ' ', '(', '1', ')', '  ', 'x'])
  })
})

describe('parseDiff multi-file diffs', () => {
  const TWO_FILES = [
    'diff --git a/a.ts b/a.ts',
    'index 111..222 100644',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -1,2 +1,2 @@',
    '-const a = 1',
    '+const a = 2',
    ' same',
    'diff --git a/b.ts b/b.ts',
    'index 333..444 100644',
    '--- a/b.ts',
    '+++ b/b.ts',
    '@@ -1,2 +1,2 @@',
    ' same',
    '-const b = 1',
    '+const b = 2'
  ].join('\n')

  it('parses the second file header as meta, not as change lines', () => {
    const lines = parseDiff(TWO_FILES)
    // The second file's `--- a/b.ts` / `+++ b/b.ts` must NOT become -/+ rows.
    const delTexts = lines.filter(l => l.kind === 'del').map(l => l.text)
    const addTexts = lines.filter(l => l.kind === 'add').map(l => l.text)
    expect(delTexts).toEqual(['const a = 1', 'const b = 1'])
    expect(addTexts).toEqual(['const a = 2', 'const b = 2'])
    expect(
      lines.filter(l => l.kind === 'meta' && l.text.startsWith('diff --git'))
    ).toHaveLength(2)
  })

  it('restarts line numbering for each file', () => {
    const lines = parseDiff(TWO_FILES)
    const dels = lines.filter(l => l.kind === 'del')
    expect(dels[0].oldNo).toBe(1)
    expect(dels[1].oldNo).toBe(2)
  })
})
