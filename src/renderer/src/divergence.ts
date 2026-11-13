import type { BranchInfo, RepositoryStatus } from '../../shared/models'

/**
 * The words half of the divergence story, kept out of the components the way
 * progressive.ts keeps its rules: pure, so the sentences the desk speaks are
 * unit-testable without a renderer, and so a component never invents its own
 * phrasing for the same git fact. The glyph half — the chips themselves —
 * lives in components/BranchBadges.tsx, which draws from these.
 *
 * Incoming work is always named before outgoing work, because that is the
 * order the compound Pull & Push verb carries it out in.
 */

/** "3 commits" / "1 commit" — the count phrase every sentence here shares. */
export function commits(n: number): string {
  return `${n} commit${n === 1 ? '' : 's'}`
}

/**
 * Pure: the spoken form of a divergence —
 * "2 commits behind · 3 ahead" / "3 commits ahead" / "in sync".
 */
export function divergenceSentence(ahead: number, behind: number): string {
  const parts: string[] = []
  if (behind > 0) parts.push(`${commits(behind)} behind`)
  if (ahead > 0)
    parts.push(parts.length > 0 ? `${ahead} ahead` : `${commits(ahead)} ahead`)
  return parts.length > 0 ? parts.join(' · ') : 'in sync'
}

/** " — 2 commits behind · 3 ahead" for row tooltips; '' when unknown/identical. */
export function divergenceTitleSuffix(branch: BranchInfo): string {
  const { ahead, behind } = branch
  if (ahead === undefined || behind === undefined) return ''
  if (ahead === 0 && behind === 0) return ''
  return ` — ${divergenceSentence(ahead, behind)}`
}

/**
 * The accessible name for a branch row. The chips are `aria-hidden` — read
 * aloud, `↓2` is "down two" — so whatever carries them has to say the same
 * thing in words, including a deleted upstream the chips cannot put a number
 * on.
 */
export function branchAriaLabel(branch: BranchInfo): string {
  const parts = [
    branch.remote === undefined
      ? branch.name
      : `${branch.remote}/${branch.name}`
  ]
  if (branch.current) parts.push('current branch')
  const suffix = divergenceTitleSuffix(branch)
  if (suffix.length > 0) parts.push(suffix.slice(3))
  if (branch.upstreamGone === true && branch.upstream !== undefined)
    parts.push(`upstream ${branch.upstream} deleted on the remote`)
  return parts.join(' — ')
}

/**
 * The tooltip for a commit's ↑ mark — the outgoing fact the divergence chips
 * count, pinned to one commit instead of a branch. Shared so the history list
 * and the commit detail cannot say it two different ways, and worded so a
 * branch with nothing to name (`origin/main` absent) points at the verb that
 * changes that rather than naming a ref that is not there.
 */
export function unpushedMarkTitle(status: RepositoryStatus | null): string {
  return status?.upstream === undefined
    ? 'Not on the remote yet — Publish sends it'
    : `Not pushed to ${status.upstream}`
}
