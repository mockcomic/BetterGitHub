import { describe, expect, it } from 'vitest'
import { parseStashList } from '../src/main/git/stash'

const FIELD = String.fromCharCode(0x1f)
const RECORD = String.fromCharCode(0x1e)

function entry(label: string, subject: string, date: string): string {
  return [label, subject, date].join(FIELD) + RECORD
}

describe('parseStashList', () => {
  it('parses entries with index, label, message and date', () => {
    const out = parseStashList(
      entry(
        'stash@{0}',
        'On main: Aspen on main',
        '2026-10-19T21:31:55-07:00'
      ) +
        entry('stash@{1}', 'WIP on feature/x: abc1234 some subject', '2026-10-01T10:00:00Z')
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      index: 0,
      label: 'stash@{0}',
      message: 'On main: Aspen on main',
      date: '2026-10-19T21:31:55-07:00',
      branch: 'main'
    })
    expect(out[1].branch).toBe('feature/x')
    expect(out[1].index).toBe(1)
  })

  it('leaves the branch empty for an unrecognised subject', () => {
    const out = parseStashList(entry('stash@{0}', 'mystery', ''))
    expect(out[0].branch).toBe('')
    expect(out[0].date).toBe('')
  })

  it('falls back to a generated label when git gives none', () => {
    const out = parseStashList(entry('', 'On main: x', ''))
    expect(out[0].label).toBe('stash@{0}')
  })

  it('returns an empty list for empty output', () => {
    expect(parseStashList('')).toEqual([])
    expect(parseStashList('\n\n')).toEqual([])
  })
})
