import { describe, expect, it } from 'vitest'
import {
  closeTab,
  emptyStrip,
  openTab,
  selectTab,
  type TabStrip
} from '../src/renderer/src/terminal-tabs'

/**
 * The panel used to hard-code a single session, so the rules for a strip of
 * them are new: which tab wins when one closes, what happens to the last one,
 * and that a closed id never comes back as a live tab's key. Pure data, so no
 * DOM and no PTY — same split as the shell-choice rules in terminal.test.ts.
 */

function stripWith(count: number): TabStrip {
  let strip = emptyStrip
  for (let i = 0; i < count; i++) strip = openTab(strip).strip
  return strip
}

describe('openTab', () => {
  it('appends and activates, with ids that never repeat', () => {
    const first = openTab(emptyStrip)
    const second = openTab(first.strip)
    expect(first.id).toBe(1)
    expect(second.id).toBe(2)
    expect(second.strip.tabs).toEqual([{ id: 1 }, { id: 2 }])
    expect(second.strip.activeId).toBe(2)
    expect(second.strip.nextId).toBe(3)
  })

  it('does not reuse a closed id', () => {
    const three = stripWith(3)
    const closed = closeTab(three, 2)
    const opened = openTab(closed.strip)
    expect(opened.id).toBe(4)
    expect(opened.strip.tabs).toEqual([{ id: 1 }, { id: 3 }, { id: 4 }])
  })

  it('carries a script run tab through the strip like a plain tab', () => {
    const shell = openTab(emptyStrip)
    const script = openTab(shell.strip, { command: 'npm run dev', label: 'npm run dev' })
    expect(script.strip.tabs[1]).toEqual({
      id: 2,
      command: 'npm run dev',
      label: 'npm run dev'
    })
    // Closing the shell beside it must not disturb the script tab or the
    // active selection.
    const closed = closeTab(script.strip, 1)
    expect(closed.strip.tabs).toEqual([
      { id: 2, command: 'npm run dev', label: 'npm run dev' }
    ])
    expect(closed.strip.activeId).toBe(2)
  })
})

describe('closeTab', () => {
  it('prefers the tab to the left of the closed active one', () => {
    const three = selectTab(stripWith(3), 3)
    const closed = closeTab(three, 3)
    expect(closed.activeWasClosed).toBe(true)
    expect(closed.empty).toBe(false)
    expect(closed.strip.activeId).toBe(2)
    expect(closed.strip.tabs).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('falls back to the right when the closed tab was first', () => {
    const three = selectTab(stripWith(3), 1)
    const closed = closeTab(three, 1)
    expect(closed.strip.activeId).toBe(2)
  })

  it('leaves the active tab alone when a background tab closes', () => {
    const three = selectTab(stripWith(3), 2)
    const closed = closeTab(three, 1)
    expect(closed.activeWasClosed).toBe(false)
    expect(closed.strip.activeId).toBe(2)
    expect(closed.strip.tabs).toEqual([{ id: 2 }, { id: 3 }])
  })

  it('reports empty when the last tab goes', () => {
    const closed = closeTab(stripWith(1), 1)
    expect(closed.empty).toBe(true)
    expect(closed.activeWasClosed).toBe(true)
    expect(closed.strip).toEqual({ tabs: [], activeId: null, nextId: 2 })
  })

  it('is a no-op for an id that is not in the strip', () => {
    const three = stripWith(3)
    expect(closeTab(three, 99)).toEqual({
      strip: three,
      activeWasClosed: false,
      empty: false
    })
  })
})

describe('selectTab', () => {
  it('ignores an id that is not open', () => {
    const two = stripWith(2)
    expect(selectTab(two, 7)).toBe(two)
    expect(selectTab(two, 1).activeId).toBe(1)
  })
})
