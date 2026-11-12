import { describe, expect, it } from 'vitest'
import {
  AUTO_FETCH_CHOICES,
  DEFAULT_AUTO_FETCH_MINUTES,
  autoFetchDelayMs,
  autoFetchSkipReason,
  isAutoFetchMinutes,
  sanitizeAutoFetchMinutes
} from '../src/shared/auto-fetch'
import type { AutoFetchGuard } from '../src/shared/auto-fetch'

function guard(patch: Partial<AutoFetchGuard> = {}): AutoFetchGuard {
  return {
    autoFetchMinutes: 5,
    repoPath: 'C:/repos/one',
    remoteUrl: 'https://github.com/me/one.git',
    busy: null,
    inFlightPath: null,
    ...patch
  }
}

describe('isAutoFetchMinutes', () => {
  it('accepts exactly the offered cadences', () => {
    for (const minutes of AUTO_FETCH_CHOICES) {
      expect(isAutoFetchMinutes(minutes)).toBe(true)
    }
  })

  it('rejects everything else, including near-misses', () => {
    for (const value of [7, -1, 0.5, '5', 10, NaN, undefined, null, {}]) {
      expect(isAutoFetchMinutes(value)).toBe(false)
    }
  })
})

describe('sanitizeAutoFetchMinutes', () => {
  it('keeps every allowed value', () => {
    for (const minutes of AUTO_FETCH_CHOICES) {
      expect(sanitizeAutoFetchMinutes(minutes)).toBe(minutes)
    }
  })

  it('falls back to the default for a hand-edited settings file', () => {
    // A cadence nobody asked for is merely unexpected; a background fetch that
    // quietly stopped (0) would be invisible, so garbage never reads as off.
    for (const value of [7, -1, '5', null, undefined, NaN]) {
      expect(sanitizeAutoFetchMinutes(value)).toBe(
        DEFAULT_AUTO_FETCH_MINUTES
      )
    }
  })
})

describe('autoFetchDelayMs', () => {
  it('is null for off and for anything unrecognised', () => {
    expect(autoFetchDelayMs(0)).toBeNull()
    for (const value of [null, undefined, 'x', 7, -5]) {
      expect(autoFetchDelayMs(value)).toBeNull()
    }
  })

  it('converts the offered minutes to milliseconds', () => {
    expect(autoFetchDelayMs(1)).toBe(60_000)
    expect(autoFetchDelayMs(5)).toBe(300_000)
    expect(autoFetchDelayMs(15)).toBe(900_000)
    expect(autoFetchDelayMs(30)).toBe(1_800_000)
    expect(autoFetchDelayMs(60)).toBe(3_600_000)
  })
})

describe('autoFetchSkipReason', () => {
  it('runs for an idle, published repository on a schedule', () => {
    expect(autoFetchSkipReason(guard())).toBeNull()
  })

  it('says off before anything else, so Off means fully manual', () => {
    expect(
      autoFetchSkipReason(
        guard({
          autoFetchMinutes: 0,
          repoPath: null,
          remoteUrl: null,
          busy: 'commit'
        })
      )
    ).toBe('off')
  })

  it('waits for a repository to be selected', () => {
    expect(autoFetchSkipReason(guard({ repoPath: null }))).toBe('no-repo')
  })

  it('skips a repository with no origin instead of failing every tick', () => {
    expect(autoFetchSkipReason(guard({ remoteUrl: null }))).toBe('no-origin')
  })

  it('never runs alongside a user verb', () => {
    for (const busy of ['commit', 'pull', 'push', 'fetch']) {
      expect(autoFetchSkipReason(guard({ busy }))).toBe('busy')
    }
  })

  it('skips its own next tick while a fetch of that repo is in flight', () => {
    expect(
      autoFetchSkipReason(guard({ inFlightPath: 'C:/repos/one' }))
    ).toBe('in-flight')
  })

  it('is not blocked by an in-flight fetch of a different repository', () => {
    // The switch dropped the old selection mid-flight; the new repo still
    // deserves its fetch rather than waiting a whole interval.
    expect(
      autoFetchSkipReason(guard({ inFlightPath: 'C:/repos/two' }))
    ).toBeNull()
  })
})
