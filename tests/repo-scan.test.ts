import { describe, expect, it } from 'vitest'
import {
  parentKey,
  pathKey,
  planScan,
  type ScannedEntry
} from '../src/main/repo-scan-plan'

// Case-folding follows the platform default (Windows/macOS insensitive,
// Linux sensitive); tests avoid relying on that except where asserted.
const FOLDER = '/repos'
const entry = (p: string): ScannedEntry => ({ key: pathKey(p), path: p })

describe('pathKey', () => {
  it('normalizes separators and trailing slashes', () => {
    expect(pathKey('C:\\Users\\dev\\repos\\aspen\\')).toBe(
      process.platform === 'linux'
        ? 'C:/Users/dev/repos/aspen'
        : 'c:/users/dev/repos/aspen'
    )
    expect(pathKey('/repos/aspen/')).toBe(
      process.platform === 'linux' ? '/repos/aspen' : '/repos/aspen'
    )
  })

  it('keeps case on linux, folds it elsewhere', () => {
    if (process.platform === 'linux') {
      expect(pathKey('/Repos/Aspen')).toBe('/Repos/Aspen')
    } else {
      expect(pathKey('/Repos/Aspen')).toBe('/repos/aspen')
    }
  })
})

describe('parentKey', () => {
  it('returns the parent directory', () => {
    expect(parentKey(pathKey('/repos/aspen'))).toBe(pathKey('/repos'))
    expect(parentKey(pathKey('/repos'))).toBe('')
    expect(parentKey('aspen')).toBe('')
    expect(parentKey('/aspen')).toBe('')
  })
})

describe('planScan', () => {
  it('adds folders that are new to the list', () => {
    const plan = planScan({
      folderKey: pathKey(FOLDER),
      candidates: [entry('/repos/aspen'), entry('/repos/other')],
      stored: [entry('/repos/aspen')],
      dismissed: []
    })
    expect(plan.toAdd).toEqual(['/repos/other'])
    expect(plan.toRemove).toEqual([])
    expect(plan.toUnDismiss).toEqual([])
  })

  it('drops stored entries whose folder left the watch folder', () => {
    const plan = planScan({
      folderKey: pathKey(FOLDER),
      candidates: [],
      stored: [entry('/repos/gone')],
      dismissed: []
    })
    expect(plan.toRemove).toEqual(['/repos/gone'])
    expect(plan.toAdd).toEqual([])
  })

  it('leaves entries from outside the watch folder alone', () => {
    // Moved-outside or on another drive: the scan does not manage them —
    // they keep the manual rules (shown as missing, never auto-dropped).
    const plan = planScan({
      folderKey: pathKey(FOLDER),
      candidates: [],
      stored: [entry('/elsewhere/keepme')],
      dismissed: []
    })
    expect(plan.toRemove).toEqual([])
  })

  it('honours dismissals while the folder is still there', () => {
    const plan = planScan({
      folderKey: pathKey(FOLDER),
      candidates: [entry('/repos/handsoff')],
      stored: [],
      dismissed: [entry('/repos/handsoff')]
    })
    expect(plan.toAdd).toEqual([])
    expect(plan.toUnDismiss).toEqual([])
  })

  it('forgets a dismissal once its folder is gone', () => {
    // A folder recreated under the same name is a new repo: re-add it.
    const plan = planScan({
      folderKey: pathKey(FOLDER),
      candidates: [],
      stored: [],
      dismissed: [entry('/repos/handsoff')]
    })
    expect(plan.toUnDismiss).toEqual(['/repos/handsoff'])
  })

  it('does not re-add a stored-and-dismissed mismatch', () => {
    const plan = planScan({
      folderKey: pathKey(FOLDER),
      candidates: [entry('/repos/x')],
      stored: [entry('/repos/x')],
      dismissed: [entry('/repos/x')]
    })
    expect(plan.toAdd).toEqual([])
    expect(plan.toRemove).toEqual([])
    expect(plan.toUnDismiss).toEqual([])
  })

  it('matches folders case-insensitively off linux', () => {
    const plan = planScan({
      folderKey: pathKey(FOLDER),
      candidates: [{ key: pathKey('/repos/Aspen'), path: '/repos/Aspen' }],
      stored: [{ key: pathKey('/repos/aspen'), path: '/repos/aspen' }],
      dismissed: []
    })
    // Same folder on Windows/macOS → nothing to do; on Linux the differing
    // case really is a second folder, so it gets added.
    expect(plan.toAdd).toEqual(
      process.platform === 'linux' ? ['/repos/Aspen'] : []
    )
  })

  it('drops an entry that is no longer a git repo', () => {
    // .git deleted (de-gitified folder) → leaves the list like any other
    // folder that vanished from the watch folder.
    const plan = planScan({
      folderKey: pathKey(FOLDER),
      candidates: [],
      stored: [entry('/repos/nogit')],
      dismissed: []
    })
    expect(plan.toRemove).toEqual(['/repos/nogit'])
  })
})
