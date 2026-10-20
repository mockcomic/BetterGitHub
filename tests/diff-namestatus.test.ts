import { describe, expect, it } from 'vitest'
import { parseNameStatusZ } from '../src/main/git/diff'

const NUL = '\u0000'

describe('parseNameStatusZ', () => {
  it('parses status/path record pairs', () => {
    const out = parseNameStatusZ(
      ['M', 'README.md', 'A', 'src/new.ts', 'D', 'gone.txt', ''].join(NUL)
    )
    expect(out).toEqual([
      { path: 'README.md', code: 'M' },
      { path: 'src/new.ts', code: 'A' },
      { path: 'gone.txt', code: 'D' }
    ])
  })

  it('parses renames with the old path in the record after the new path', () => {
    const out = parseNameStatusZ(
      ['R100', 'src/new-name.ts', 'src/old-name.ts', 'M', 'other.ts', ''].join(
        NUL
      )
    )
    expect(out).toEqual([
      { path: 'src/new-name.ts', oldPath: 'src/old-name.ts', code: 'R100' },
      { path: 'other.ts', code: 'M' }
    ])
  })

  it('parses copies the same way as renames', () => {
    const out = parseNameStatusZ(['C90', 'b.txt', 'a.txt', ''].join(NUL))
    expect(out).toEqual([{ path: 'b.txt', oldPath: 'a.txt', code: 'C90' }])
  })

  it('handles spaces and unicode in paths', () => {
    const out = parseNameStatusZ(['A', 'docs/my guide éè.md', ''].join(NUL))
    expect(out).toEqual([{ path: 'docs/my guide éè.md', code: 'A' }])
  })

  it('returns empty for empty output', () => {
    expect(parseNameStatusZ('')).toEqual([])
    expect(parseNameStatusZ(NUL)).toEqual([])
  })
})
