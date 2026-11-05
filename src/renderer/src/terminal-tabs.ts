/**
 * The terminal panel's tab strip, as pure data.
 *
 * Every tab is one live PTY session in main (src/main/terminal.ts keys its map
 * by the id `terminalStart` returns, so it already happily runs several at
 * once). This list is keyed by a local, monotonic id instead: a tab keeps its
 * slot in the strip while its session id is still in flight, and a dead
 * session never lets its id be reused by a later tab.
 *
 * Keeping open/close/switch as plain functions — exactly like the shell-choice
 * rules in main — leaves the interesting parts (which tab wins when one dies,
 * what the strip looks like when the last one goes) testable without a DOM.
 */

export interface TerminalTab {
  /** Stable renderer-local key; deliberately not the PTY session id. */
  readonly id: number
}

export interface TabStrip {
  readonly tabs: ReadonlyArray<TerminalTab>
  readonly activeId: number | null
  /** The id the next opened tab takes; never reused, even after a close. */
  readonly nextId: number
}

export const emptyStrip: TabStrip = { tabs: [], activeId: null, nextId: 1 }

/** Append a tab and make it the active one (the way every terminal does). */
export function openTab(strip: TabStrip): { readonly strip: TabStrip; readonly id: number } {
  const id = strip.nextId
  return {
    strip: { tabs: [...strip.tabs, { id }], activeId: id, nextId: id + 1 },
    id
  }
}

export function selectTab(strip: TabStrip, id: number): TabStrip {
  return strip.tabs.some(tab => tab.id === id) ? { ...strip, activeId: id } : strip
}

export interface CloseResult {
  readonly strip: TabStrip
  /** True when the killed tab was on screen, so the view's own teardown is
   *  what ends the session; the caller only has to care about `empty`. */
  readonly activeWasClosed: boolean
  /** True when no tabs are left: the panel has nothing to show any more. */
  readonly empty: boolean
}

/**
 * Remove a tab. When it was the active one the neighbour to its left wins,
 * falling back to the right, so switching back feels like moving one step
 * sideways through the strip rather than jumping to the far end.
 */
export function closeTab(strip: TabStrip, id: number): CloseResult {
  const index = strip.tabs.findIndex(tab => tab.id === id)
  if (index < 0) return { strip, activeWasClosed: false, empty: strip.tabs.length === 0 }
  const tabs = strip.tabs.filter(tab => tab.id !== id)
  const activeWasClosed = strip.activeId === id
  if (!activeWasClosed) return { strip: { ...strip, tabs }, activeWasClosed, empty: false }
  const successor = tabs[index - 1] ?? tabs[index] ?? null
  return {
    strip: { ...strip, tabs, activeId: successor === null ? null : successor.id },
    activeWasClosed,
    empty: tabs.length === 0
  }
}
