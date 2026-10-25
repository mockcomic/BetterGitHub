/**
 * Parser for `git status --branch --porcelain=2 -z --untracked-files=all`.
 *
 * Mirrors the porcelain-v2 parsing GitHub Desktop does in
 * `app/src/lib/status-parser.ts` + `app/src/lib/git/status.ts`
 * (verified against the 3.6.7 shipped bundle).
 */

export interface PorcelainEntry {
  readonly path: string
  readonly oldPath?: string
  /** X: index vs HEAD ('.' when unchanged). */
  readonly indexCode: string
  /** Y: worktree vs index ('.' when unchanged). */
  readonly worktreeCode: string
  readonly untracked: boolean
  /** True for porcelain-v2 `u` records: the path is unmerged regardless of
   * whether the XY letters read UU, AA, DD, AU, UA, DU or UD. */
  readonly unmerged?: boolean
}

export interface PorcelainHeader {
  branch: string
  oid: string
  upstream?: string
  ahead: number
  behind: number
  detached: boolean
}

export interface PorcelainStatus {
  readonly header: PorcelainHeader
  readonly entries: ReadonlyArray<PorcelainEntry>
}

export function parsePorcelainStatus(output: string): PorcelainStatus {
  const records = output.split('\0')
  const header: PorcelainHeader = {
    branch: '',
    oid: '',
    ahead: 0,
    behind: 0,
    detached: false
  }
  const entries: PorcelainEntry[] = []

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record.length === 0) continue

    const marker = record[0]

    if (marker === '#') {
      parseHeaderLine(record, header)
      continue
    }

    if (marker === '?') {
      entries.push({
        path: record.slice(2),
        indexCode: '?',
        worktreeCode: '?',
        untracked: true
      })
      continue
    }

    if (marker === '1') {
      const parts = record.split(' ')
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      entries.push({
        path: parts.slice(8).join(' '),
        indexCode: parts[1]?.[0] ?? '.',
        worktreeCode: parts[1]?.[1] ?? '.',
        untracked: false
      })
      continue
    }

    if (marker === '2') {
      const parts = record.split(' ')
      // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <Xscore> <path> ; next record = origPath
      // The porcelain-v2 spec guarantees a rename/copy record is always
      // followed by exactly one origPath record. Testing that record for a
      // status marker would misfire on legitimate old paths that merely
      // *start* with one (`#foo.ts`, `1-starter/old.ts`, `!important.css`):
      // the entry silently lost its oldPath (or the origPath record was then
      // misparsed as a status line). Consume it unconditionally instead.
      const next = i + 1 < records.length ? records[i + 1] : undefined
      const hasOrigPath = next !== undefined
      if (hasOrigPath) i++
      entries.push({
        path: parts.slice(9).join(' '),
        indexCode: parts[1]?.[0] ?? '.',
        worktreeCode: parts[1]?.[1] ?? '.',
        untracked: false,
        oldPath: hasOrigPath ? next : undefined
      })
      continue
    }

    if (marker === 'u') {
      const parts = record.split(' ')
      // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      // (verified against `git status --porcelain=2 -z` output: unmerged
      // records carry no <Xscore>, unlike rename records)
      // The `u` record marker itself is the unmerged signal — XY can be
      // AA/DD/AU/UA/DU/UD, not just U-something, so consumers that classify
      // on the letters alone (status.ts) must not mistake these for new/deleted.
      const xy = parts[1] ?? 'UU'
      entries.push({
        path: parts.slice(10).join(' '),
        indexCode: xy[0] ?? 'U',
        worktreeCode: xy[1] ?? 'U',
        untracked: false,
        unmerged: true
      })
      continue
    }

    if (marker === '4') {
      const parts = record.split(' ')
      // 4 <XY> <sub> <name>
      entries.push({
        path: parts.slice(3).join(' '),
        indexCode: parts[1]?.[0] ?? '.',
        worktreeCode: parts[1]?.[1] ?? '.',
        untracked: false
      })
      continue
    }

    // '!' (ignored) and anything else: skip.
  }

  return { header, entries }
}

function parseHeaderLine(record: string, header: PorcelainHeader): void {
  const line = record.slice(2)
  const space = line.indexOf(' ')
  if (space === -1) return
  const key = line.slice(0, space)
  const value = line.slice(space + 1)

  switch (key) {
    case 'branch.head':
      header.detached = value === '(detached)'
      header.branch = value
      break
    case 'branch.oid':
      header.oid = value === '(corrupted)' ? '' : value
      break
    case 'branch.upstream':
      header.upstream = value
      break
    case 'branch.ab': {
      // e.g. "+2 -1"
      const plus = value.match(/\+(\d+)/)
      const minus = value.match(/-(\d+)/)
      header.ahead = plus ? parseInt(plus[1], 10) : 0
      header.behind = minus ? parseInt(minus[1], 10) : 0
      break
    }
  }
}
