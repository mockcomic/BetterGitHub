import { describe, expect, it } from 'vitest'
import {
  parsePorcelainStatus
} from '../src/main/git/porcelain'
import { toFileStatus } from '../src/main/git/status'

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

  it('classifies every unmerged XY code as conflicted', () => {
    for (const xy of ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']) {
      const out = parsePorcelainStatus(
        statusOutput(
          `u ${xy} N... 100644 100644 100644 100644 a1 a2 a3 c.txt`
        )
      )
      expect(out.entries[0].indexCode).toBe(xy[0])
      expect(out.entries[0].worktreeCode).toBe(xy[1])
      expect(toFileStatus(out.entries[0]).kind).toBe('conflicted')
    }
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

  it('keeps origPaths that start with a status-record marker char', () => {
    // The origPath record belongs to the rename by position (porcelain-v2
    // spec); a marker-looking first char of the PATH must not misread it as
    // its own record.
    for (const old of ['#legacy notes.md', '1-first.ts', '!important.css', '2.txt']) {
      const out = parsePorcelainStatus(
        statusOutput('2 R. N... 100644 100644 100644 a b R100 docs/new.md', old)
      )
      expect(out.entries).toHaveLength(1)
      expect(out.entries[0].path).toBe('docs/new.md')
      expect(out.entries[0].oldPath).toBe(old)
    }
  })

  it('parses unmerged (conflicted) entries', () => {
    // Verbatim record captured from `git status --branch --porcelain=2 -z`
    // during a conflicted merge (no <Xscore> field on u-records).
    const out = parsePorcelainStatus(
      statusOutput(
        'u UU N... 100644 100644 100644 100644 8681f8b8f32615a16703053bc1eaffb3e5e720a5 424860eef4edb9f5a2dacbbd6dc8c2d2e7645035 228068dbe790983c15535164cd483eb77ade97e4 c.txt'
      )
    )
    expect(out.entries).toHaveLength(1)
    expect(out.entries[0].indexCode).toBe('U')
    expect(out.entries[0].worktreeCode).toBe('U')
    expect(out.entries[0].path).toBe('c.txt')
  })

  it('ignores ignored (!) records and empty input', () => {
    const out = parsePorcelainStatus(statusOutput('! .gradle/cache', ''))
    expect(out.entries).toHaveLength(0)
  })
})
