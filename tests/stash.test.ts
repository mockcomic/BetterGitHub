import { describe, expect, it } from 'vitest'
import { buildStashMessage, parseStashList } from '../src/main/git/stash'

const FIELD = String.fromCharCode(0x1f)
const RECORD = String.fromCharCode(0x1e)

function entry(
  label: string,
  subject: string,
  date: string,
  body = ''
): string {
  return [label, subject, date, body].join(FIELD) + RECORD
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
      description: '',
      date: '2026-10-19T21:31:55-07:00',
      branch: 'main'
    })
    expect(out[1].branch).toBe('feature/x')
    expect(out[1].index).toBe(1)
    expect(out[1].description).toBe('')
  })

  it('reads a message body from the %b tail field', () => {
    const out = parseStashList(
      entry('stash@{0}', 'park the parser spike', '2026-10-19T21:31:55-07:00', 'Rewrites the tokenizer loop\nand defers the unicode table.')
    )
    expect(out[0].description).toBe(
      'Rewrites the tokenizer loop\nand defers the unicode table.'
    )
  })

  it('keeps a body containing the field separator', () => {
    const odd = `line one${FIELD}line two`
    const out = parseStashList(entry('stash@{0}', 's', 'd', odd))
    expect(out[0].description).toBe(odd)
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

describe('buildStashMessage', () => {
  it('uses the bare subject when there is no description', () => {
    expect(buildStashMessage('  fix the parser  ')).toBe('fix the parser')
    expect(buildStashMessage('fix the parser', '   ')).toBe('fix the parser')
  })

  it('joins subject and body with a blank line, like a commit message', () => {
    expect(buildStashMessage('fix the parser', 'The tokenizer loop was wrong.')).toBe(
      'fix the parser\n\nThe tokenizer loop was wrong.'
    )
  })
})
