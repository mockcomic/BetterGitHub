import { describe, expect, it } from 'vitest'
import {
  parseDivergence,
  parseUpstreamTrack
} from '../src/main/git/branches'

/**
 * Pure parser coverage for the branch-list divergence data: the two-number
 * `rev-list --left-right --count` output and git's `%(upstream:track)`
 * bracket format. The integration suite covers the end-to-end wiring.
 */

describe('parseDivergence', () => {
  it('reads "<left> <right>" as ahead/behind of the left rev', () => {
    expect(parseDivergence('2 0\n')).toEqual({ ahead: 2, behind: 0 })
    expect(parseDivergence('0\t7')).toEqual({ ahead: 0, behind: 7 })
    expect(parseDivergence('0 0')).toEqual({ ahead: 0, behind: 0 })
    expect(parseDivergence('123456 98765')).toEqual({
      ahead: 123456,
      behind: 98765
    })
  })

  it('rejects anything that is not exactly two numbers', () => {
    expect(parseDivergence('')).toBeNull()
    expect(parseDivergence('not a count')).toBeNull()
    expect(parseDivergence('2 0 extra')).toBeNull()
    expect(parseDivergence('-1 2')).toBeNull()
    expect(parseDivergence('2\n0')).toBeNull()
  })
})

describe('parseUpstreamTrack', () => {
  it('parses every bracket variant git prints', () => {
    expect(parseUpstreamTrack('[ahead 2]')).toEqual({ ahead: 2, behind: 0 })
    expect(parseUpstreamTrack('[behind 5]')).toEqual({ ahead: 0, behind: 5 })
    expect(parseUpstreamTrack('[ahead 1, behind 3]')).toEqual({
      ahead: 1,
      behind: 3
    })
  })

  it('treats untracked and gone upstreams as no data', () => {
    expect(parseUpstreamTrack('')).toBeNull()
    expect(parseUpstreamTrack('   ')).toBeNull()
    expect(parseUpstreamTrack('[gone]')).toBeNull()
  })

  it('is not fooled by lookalikes', () => {
    // No brackets (e.g. an unparseable format change) → no data.
    expect(parseUpstreamTrack('ahead 2')).toBeNull()
    // Brackets with unknown contents → no data (never guess zeroes).
    expect(parseUpstreamTrack('[ahead]')).toBeNull()
    expect(parseUpstreamTrack('[]')).toBeNull()
  })
})
