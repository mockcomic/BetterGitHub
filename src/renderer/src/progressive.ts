import type { PublicSettings, RepositoryStatus } from '../../shared/models'

/**
 * Progressive-disclosure rules, extracted as pure functions so they are
 * unit-testable and the components stay declarative. Each rule decides when a
 * piece of git complexity earns its place on the desk; none of them hides a
 * state that could mislead (Git truth, no magic).
 */

export type SyncVerb = 'fetch' | 'pull' | 'push'

/**
 * The one verb the strip's Sync button should offer, in the order a healthy
 * workflow needs it: catch the remote up first (behind), then land your own
 * work (ahead, or publishing a branch with no upstream), otherwise just
 * look. The caret menu always offers all three, so this picks the verb,
 * never restricts it.
 */
export function syncVerb(status: RepositoryStatus | null): SyncVerb {
  if (status === null) return 'fetch'
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
