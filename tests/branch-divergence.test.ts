import { describe, expect, it } from 'vitest'
import {
  isUpstreamGone,
  parseDivergence,
  parseUpstreamTrack
} from '../src/main/git/branches'
import {
  branchAriaLabel,
  divergenceSentence,
  divergenceTitleSuffix
} from '../src/renderer/src/divergence'
import type { BranchInfo } from '../src/shared/models'

/**
 * Pure coverage for the branch-list divergence data: the two-number
 * `rev-list --left-right --count` output, git's `%(upstream:track)` bracket
 * format, and the words the divergence chips are built from. The integration
 * suite covers the end-to-end wiring.
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

describe('isUpstreamGone', () => {
  it('recognises the deleted-upstream bracket parseUpstreamTrack reports nothing for', () => {
    expect(isUpstreamGone('[gone]')).toBe(true)
    expect(isUpstreamGone(' [gone] ')).toBe(true)
    expect(isUpstreamGone('')).toBe(false)
    expect(isUpstreamGone('[ahead 2]')).toBe(false)
    expect(isUpstreamGone('[gone ahead 2]')).toBe(false)
  })
})

describe('divergenceSentence', () => {
  it('states incoming work before outgoing work', () => {
    expect(divergenceSentence(3, 2)).toBe('2 commits behind · 3 ahead')
    expect(divergenceSentence(0, 2)).toBe('2 commits behind')
    expect(divergenceSentence(3, 0)).toBe('3 commits ahead')
    expect(divergenceSentence(1, 1)).toBe('1 commit behind · 1 ahead')
  })

  it('says the plain thing when there is nothing to report', () => {
    expect(divergenceSentence(0, 0)).toBe('in sync')
  })
})

describe('divergenceTitleSuffix', () => {
  it('stays out of the tooltip when the row has no numbers to show', () => {
    expect(divergenceTitleSuffix({ name: 'x', head: 'a', current: false })).toBe('')
    expect(
      divergenceTitleSuffix(
        branch({ ahead: 0, behind: 0, upstream: 'origin/x' })
      )
    ).toBe('')
  })

  it('carries the same sentence the chips spell in glyphs', () => {
    expect(divergenceTitleSuffix(branch({ ahead: 4, behind: 1 }))).toBe(
      ' — 1 commit behind · 4 ahead'
    )
  })
})

describe('branchAriaLabel', () => {
  it('names the remote for a remote-tracking branch', () => {
    expect(
      branchAriaLabel(branch({ name: 'main', remote: 'origin' }))
    ).toBe('origin/main')
  })

  it('says the divergence, the checked-out state and a deleted upstream in words', () => {
    // The chips are aria-hidden, so this string is their only announcement.
    expect(
      branchAriaLabel(
        branch({
          name: 'trunk',
          current: true,
          ahead: 2,
          behind: 5,
          upstream: 'origin/trunk',
          upstreamGone: true
        })
      )
    ).toBe(
      'trunk — current branch — 5 commits behind · 2 ahead — upstream origin/trunk deleted on the remote'
    )
  })
})

function branch(patch: Partial<BranchInfo> = {}): BranchInfo {
  return { name: 'feature', head: 'deadbeef', current: false, ...patch }
}
