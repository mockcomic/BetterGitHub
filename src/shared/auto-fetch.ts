/**
 * Background fetch policy — the pure half of "keep the remote picture honest".
 *
 * Aspen used to talk to origin only when told to: the strip's Fetch verb, its
 * ▾ menu, and one best-effort call after a push bounced off a moved-ahead
 * remote. This module decides *when* the app asks on its own: on a fixed
 * cadence against the selected repository, and once when the selection
 * changes (so switching repositories shows today's counts, not the ones from
 * whenever that repo was last open). Everything here is pure so the rules can
 * be tested without timers, IPC or a git subprocess — the renderer store owns
 * the interval and the actual `fetch` call.
 *
 * Fetch and nothing else: a background `pull` would merge into the working
 * tree unasked, which no amount of cadence makes automatic.
 */

/** Interval choices in minutes, ascending; 0 = fully manual. */
export const AUTO_FETCH_CHOICES = [0, 1, 5, 15, 30, 60] as const

export type AutoFetchMinutes = (typeof AUTO_FETCH_CHOICES)[number]

/** Used for a first run and for a settings file carrying anything else. */
export const DEFAULT_AUTO_FETCH_MINUTES: AutoFetchMinutes = 5

export function isAutoFetchMinutes(value: unknown): value is AutoFetchMinutes {
  return (
    typeof value === 'number' &&
    (AUTO_FETCH_CHOICES as ReadonlyArray<number>).includes(value)
  )
}

/**
 * The stored value read back safe: aspen-settings.json is user-editable, so a
 * cadence outside the offered set (a hand-typed `7`, a stale string `"5"`, a
 * null from a half-written file) falls back to the default rather than to off
 * — a background fetch that quietly stopped is invisible, a cadence nobody
 * asked for is merely unexpected.
 */
export function sanitizeAutoFetchMinutes(value: unknown): AutoFetchMinutes {
  return isAutoFetchMinutes(value) ? value : DEFAULT_AUTO_FETCH_MINUTES
}

/** Milliseconds between automatic fetches; null = automatic fetch is off. */
export function autoFetchDelayMs(value: unknown): number | null {
  if (!isAutoFetchMinutes(value) || value === 0) return null
  return value * 60_000
}

/** Why an automatic fetch does not run right now; null = go ahead. */
export type AutoFetchSkipReason =
  | 'off'
  | 'no-repo'
  | 'no-origin'
  | 'busy'
  | 'in-flight'

export interface AutoFetchGuard {
  readonly autoFetchMinutes: unknown
  /** Path of the selected repository, or null when none is open. */
  readonly repoPath: string | null
  /** The selected repository's origin URL; null = it has no remote yet. */
  readonly remoteUrl: string | null
  /** The in-flight user verb (commit/pull/push…), or null when idle. */
  readonly busy: string | null
  /** Path whose automatic fetch is still running, if any. */
  readonly inFlightPath: string | null
}

/**
 * Every reason not to fetch, cheapest and loudest first. A repository without
 * an origin is skipped rather than failed: `git fetch origin` on an unpublished
 * repo would error on every tick, and publishing (or adding a remote) re-runs
 * the selection path, which re-arms the fetch with the URL now on record.
 */
export function autoFetchSkipReason(
  guard: AutoFetchGuard
): AutoFetchSkipReason | null {
  if (autoFetchDelayMs(guard.autoFetchMinutes) === null) return 'off'
  if (guard.repoPath === null) return 'no-repo'
  if (guard.remoteUrl === null) return 'no-origin'
  if (guard.busy !== null) return 'busy'
  // A slow fetch skips its own next tick instead of stacking a second git
  // subprocess onto the same refs.
  if (guard.inFlightPath === guard.repoPath) return 'in-flight'
  return null
}
