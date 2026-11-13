import type { PublicSettings, RepositoryStatus } from '../../shared/models'
import { commits } from './divergence'

/**
 * Progressive-disclosure rules, extracted as pure functions so they are
 * unit-testable and the components stay declarative. Each rule decides when a
 * piece of git complexity earns its place on the desk; none of them hides a
 * state that could mislead (Git truth, no magic).
 */

export type SyncVerb = 'fetch' | 'pull' | 'push' | 'sync'

/**
 * The one verb the strip's Sync button should offer, in the order a healthy
 * workflow needs it: when the branch has diverged — or a push just bounced
 * off a moved-ahead remote — offer the compound Pull & Push (`sync`), which
 * lands the remote first and sends your work in one click; then catch the
 * remote up (behind), then land your own work (ahead, or publishing a branch
 * with no upstream), otherwise just look. The caret menu always offers the
 * raw verbs, so this picks the default, never restricts it.
 *
 * `pushNeedsPull` is renderer-side recovery state, not git truth: main sets
 * it in flight after a push was rejected non-fast-forward, covering the
 * moment before the next status read can show `behind > 0`. It only ever
 * *adds* the compound verb — clearing it falls back to the same decision a
 * fresh status would produce.
 *
 * A branch whose upstream ref was deleted on the remote (`upstreamGone`) is
 * the one state ahead of that ladder: git reports `+0 -0` against a ref that
 * is not there, so "nothing to do" would strand the work. Pull is impossible
 * and Push is the only recovery — it republishes the branch and re-sets the
 * upstream — which is why a rejected push cannot outrank it either.
 */
export function syncVerb(
  status: RepositoryStatus | null,
  pushNeedsPull = false
): SyncVerb {
  if (status === null) return 'fetch'
  if (status.upstreamGone === true) return 'push'
  if (pushNeedsPull || ((status.behind ?? 0) > 0 && (status.ahead ?? 0) > 0))
    return 'sync'
  if ((status.behind ?? 0) > 0) return 'pull'
  if ((status.ahead ?? 0) > 0 || status.upstream === undefined) return 'push'
  return 'fetch'
}

/**
 * Staged/unstaged badges only appear once something actually is staged.
 * While nothing is staged every row would carry the identical "unstaged"
 * badge — information that says nothing — and the two mechanisms (badge vs
 * include-checkbox) compete before the reader knows why both exist.
 */
export function showStagedBadges(status: RepositoryStatus | null): boolean {
  if (status === null) return false
  return status.files.some(f => f.staged)
}

/**
 * Whether the AI agent reads as configured. The compiled default Base URL
 * points at OpenAI; without a key there, generation can only answer 401 —
 * so that state routes Generate to Preferences instead of a doomed request.
 * A custom endpoint (local Ollama, LM Studio…) may legitimately need no
 * key, so a non-default Base URL counts as configured.
 */
export function aiLooksUnconfigured(settings: PublicSettings | null): boolean {
  if (settings === null) return false
  const base = settings.ai.baseUrl.trim()
  if (base.length === 0) return true
  return !settings.ai.hasApiKey && base.startsWith('https://api.openai.com')
}

/** What the History desk's Unpushed pill says, and what its empty list says. */
export interface UnpushedStory {
  /**
   * The pill's counter. Git's `ahead` count while the branch tracks a live
   * remote ref — the same measurement the Push verb wears — and otherwise the
   * rows the log itself marked, because a branch with no upstream has no
   * ahead count to quote, only commits the remote has never seen.
   */
  readonly count: number
  readonly title: string
  readonly emptyTitle: string
  readonly emptyHint: string
}

/**
 * The outgoing work, in the words the pill, its tooltip and its empty state
 * need. One function so the pill can never quote a number the strip's ↑ chip
 * disagrees with, and so the three states that have no `ahead` to show —
 * detached, unpublished, and a tracked ref deleted on the server — each say so
 * instead of reading as an empty list. `markedOnPage` is how many rows the
 * loaded log flagged; the marks are git's own answer (src/main/git/log.ts),
 * never a row's position.
 */
export function unpushedStory(
  status: RepositoryStatus | null,
  markedOnPage: number
): UnpushedStory {
  const nothing = 'Nothing to push'
  if (status === null) {
    return {
      count: 0,
      title: 'Loading repository status…',
      emptyTitle: nothing,
      emptyHint: 'Loading repository status…'
    }
  }
  const branch = status.branch
  const upstream = status.upstream
  if (status.detached) {
    return {
      count: markedOnPage,
      title:
        'A detached HEAD tracks no branch — these commits are on no remote yet',
      emptyTitle: nothing,
      emptyHint: 'Every commit reachable from here is already on the remote.'
    }
  }
  if (upstream === undefined) {
    return {
      count: markedOnPage,
      title: `${branch} is not on the remote yet — its commits are unpushed until you Publish`,
      emptyTitle: nothing,
      emptyHint: `Every commit here is already on the remote — Publish only creates ${branch} on it.`
    }
  }
  if (status.upstreamGone === true) {
    return {
      count: markedOnPage,
      title: `The remote branch ${upstream} was deleted — Push republishes ${branch} with these commits`,
      emptyTitle: nothing,
      emptyHint: `Every commit here is already on the remote — Push recreates ${upstream}.`
    }
  }
  const ahead = status.ahead ?? 0
  const behind = status.behind ?? 0
  if (ahead > 0) {
    return {
      count: ahead,
      title: `List only the ${commits(ahead)} waiting to be pushed to ${upstream}`,
      emptyTitle: nothing,
      emptyHint: `${branch} is up to date with ${upstream}.`
    }
  }
  // Nothing to send is not the same statement as nothing happening: with
  // incoming work the branch is behind, and saying "up to date" would quote
  // git's ahead count while hiding the behind count sitting next to it.
  if (behind > 0) {
    return {
      count: 0,
      title: `Nothing is waiting to be pushed — ${upstream} has ${commits(behind)} to pull first`,
      emptyTitle: nothing,
      emptyHint: `${branch} is ${commits(behind)} behind ${upstream} — Pull brings them down first.`
    }
  }
  return {
    count: 0,
    title: `Nothing is waiting to be pushed — ${branch} is up to date with ${upstream}`,
    emptyTitle: nothing,
    emptyHint: `${branch} is up to date with ${upstream}.`
  }
}
