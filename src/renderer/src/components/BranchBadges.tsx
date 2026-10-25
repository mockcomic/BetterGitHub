import type { JSX } from 'react'
import type { BranchInfo } from '../../../shared/models'

/**
 * The ↑/↓ divergence badges branch rows carry in the branch switcher and
 * the merge dialog. Two flavours per row, both hidden when there is
 * nothing to report (undefined = not comparable, 0/0 = identical):
 *
 * - `.branch-div`        — the branch vs the currently checked-out branch
 * - `.branch-div.upstream` — the branch vs the upstream it tracks (dimmer)
 *
 * The machine-truth cells convention applies: tabular digits, muted color,
 * and the full sentence lives in the tooltip.
 */

function plural(n: number): string {
  return `${n} commit${n === 1 ? '' : 's'}`
}

/** "3 commits ahead · 1 behind" / "2 commits ahead" / "in sync". */
export function divergenceText(ahead: number, behind: number): string {
  const parts: string[] = []
  if (ahead > 0) parts.push(`${plural(ahead)} ahead`)
  if (behind > 0) parts.push(`${plural(behind)} behind`)
  return parts.length > 0 ? parts.join(' · ') : 'in sync'
}

function glyphs(ahead: number, behind: number): string {
  const parts: string[] = []
  if (ahead > 0) parts.push(`↑${ahead}`)
  if (behind > 0) parts.push(`↓${behind}`)
  return parts.join(' ')
}

/** True when the row carries a vs-current badge. */
export function hasDivergence(branch: BranchInfo): boolean {
  const { ahead, behind } = branch
  return ahead !== undefined && behind !== undefined && (ahead > 0 || behind > 0)
}

/** " — 3 commits ahead · 1 behind" for row tooltips; '' when unknown/identical. */
export function divergenceTitleSuffix(branch: BranchInfo): string {
  const { ahead, behind } = branch
  if (ahead === undefined || behind === undefined) return ''
  if (ahead === 0 && behind === 0) return ''
  return ` — ${divergenceText(ahead, behind)}`
}

export function BranchDivergence({
  branch,
  current
}: {
  branch: BranchInfo
  /** Name of the checked-out branch, for the tooltips. */
  current: string
}): JSX.Element | null {
  const badges: JSX.Element[] = []

  if (
    branch.ahead !== undefined &&
    branch.behind !== undefined &&
    (branch.ahead > 0 || branch.behind > 0)
  ) {
    badges.push(
      <span
        key="vs-current"
        className="branch-div"
        title={`${divergenceText(branch.ahead, branch.behind)} compared to "${current}"`}
      >
        {glyphs(branch.ahead, branch.behind)}
      </span>
    )
  }

  if (
    branch.remote === undefined &&
    branch.upstream !== undefined &&
    branch.upstreamAhead !== undefined &&
    branch.upstreamBehind !== undefined &&
    (branch.upstreamAhead > 0 || branch.upstreamBehind > 0)
  ) {
    badges.push(
      <span
        key="vs-upstream"
        className="branch-div upstream"
        title={`${divergenceText(
          branch.upstreamAhead,
          branch.upstreamBehind
        )} compared to ${branch.upstream}`}
      >
        {glyphs(branch.upstreamAhead, branch.upstreamBehind)}
      </span>
    )
  }

  return badges.length > 0 ? <>{badges}</> : null
}
