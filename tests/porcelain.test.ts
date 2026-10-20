import { describe, expect, it } from 'vitest'
import {
  parsePorcelainStatus
} from '../src/main/git/porcelain'

const NUL = '\u0000'

function statusOutput(...records: string[]): string {
  return records.join(NUL) + NUL
}

describe('parsePorcelainStatus', () => {
  it('parses branch header lines including ahead/behind', () => {
    const out = parsePorcelainStatus(
      statusOutput(
        '# branch.oid 3b825dc642cb6eb9a060e54bf8d69288fbee4904',
        '# branch.head main',
        '# branch.upstream origin/main',
        '# branch.ab +2 -1'
      )
    )
    expect(out.header).toEqual({
      branch: 'main',
      oid: '3b825dc642cb6eb9a060e54bf8d69288fbee4904',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      detached: false
    })
  })

  it('detects detached HEAD', () => {
    const out = parsePorcelainStatus(
      statusOutput('# branch.head (detached)', '# branch.oid deadbeef')
    )
    expect(out.header.detached).toBe(true)
    expect(out.header.branch).toBe('(detached)')
  })

  it('parses a modified-in-worktree entry', () => {
    const out = parsePorcelainStatus(
      statusOutput(
        '1 M. N... 100644 100644 100644 3b825dc642cb6eb9a060e54bf8d69288fbee4904 aaaa1111 README.md'
      )
    )
    expect(out.entries).toHaveLength(1)
    expect(out.entries[0].path).toBe('README.md')
    expect(out.entries[0].indexCode).toBe('M')
    expect(out.entries[0].worktreeCode).toBe('.')
  })

  it('keeps spaces in paths for ordinary (kind 1) entries', () => {
    const out = parsePorcelainStatus(
      statusOutput(
        '1 M. N... 100644 100644 100644 abc def docs/my guide.md'
      )
    )
    expect(out.entries[0].path).toBe('docs/my guide.md')
  })

  it('parses untracked entries', () => {
    const out = parsePorcelainStatus(statusOutput('? src/new-file.ts'))
    expect(out.entries[0]).toMatchObject({
      path: 'src/new-file.ts',
      untracked: true
    })
  })

  it('parses rename entries with the original path from the next record', () => {
    const out = parsePorcelainStatus(
      statusOutput(
        '2 R. N... 100644 100644 100644 a b R100 src/new-name.ts',
        'src/old-name.ts'
      )
    )
    expect(out.entries).toHaveLength(1)
    expect(out.entries[0].path).toBe('src/new-name.ts')
    expect(out.entries[0].oldPath).toBe('src/old-name.ts')
    expect(out.entries[0].indexCode).toBe('R')
  })

  it('parses unmerged (conflicted) entries', () => {
    const out = parsePorcelainStatus(
      statusOutput(
        'u UU N... 100644 100644 100644 100644 aaa bbb ccc UU15 app.conflict'
      )
    )
    // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <hW> <Xscore> <path>
    expect(out.entries).toHaveLength(1)
    expect(out.entries[0].indexCode).toBe('U')
    expect(out.entries[0].worktreeCode).toBe('U')
    expect(out.entries[0].path).toBe('app.conflict')
  })

  it('ignores ignored (!) records and empty input', () => {
    const out = parsePorcelainStatus(statusOutput('! .gradle/cache', ''))
    expect(out.entries).toHaveLength(0)
  })
})
