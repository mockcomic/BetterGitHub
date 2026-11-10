import type { PublicSettings, RepositoryStatus } from '../../shared/models'

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
