import { describe, expect, it } from 'vitest'
import { buildLogArgs } from '../src/main/git/log'

const FIELD = String.fromCharCode(0x1f)
const RECORD = String.fromCharCode(0x1e)

describe('buildLogArgs', () => {
  it('pages with --max-count and --skip', () => {
    const args = buildLogArgs({ maxCount: 50, skip: 300 })
    expect(args).toContain('--max-count=50')
    expect(args).toContain('--skip=300')
  })

  it('defaults to 300 commits and no skip', () => {
    const args = buildLogArgs()
    expect(args).toContain('--max-count=300')
    expect(args).toContain('--skip=0')
  })

  it('ignores non-positive or non-finite numbers', () => {
    const args = buildLogArgs({ maxCount: 0, skip: -5 })
    expect(args).toContain('--max-count=300')
    expect(args).toContain('--skip=0')
    const nan = buildLogArgs({ maxCount: Number.NaN })
    expect(nan).toContain('--max-count=300')
  })

  it('adds a case-insensitive message search', () => {
    const args = buildLogArgs({ search: '  fix login  ' })
    expect(args).toContain('-i')
    expect(args).toContain('--grep=fix login')
  })

  it('omits blank search terms', () => {
    const args = buildLogArgs({ search: '   ', author: '' })
    expect(args.some(a => a.startsWith('--grep='))).toBe(false)
    expect(args.some(a => a.startsWith('--author='))).toBe(false)
  })

  it('adds an author filter', () => {
    const args = buildLogArgs({ author: 'kim' })
    expect(args).toContain('--author=kim')
  })

  it('keeps the field/record separated format', () => {
    const format = buildLogArgs().find(a => a.startsWith('--format='))
    expect(format).toContain(`%H${FIELD}%P`)
    expect(format?.endsWith(RECORD)).toBe(true)
  })
})
