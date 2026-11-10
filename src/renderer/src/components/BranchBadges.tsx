import type { JSX } from 'react'
import type { BranchInfo } from '../../../shared/models'
import { divergenceSentence } from '../divergence'

/**
 * The divergence chip: the app's one way to draw an ahead/behind count.
 *
 * A chip is the counter pill DESIGN.md already specifies — mono, tabular
 * digits, pill radius, 10.5px — carrying one direction: `↓2` behind, `↑3`
 * ahead. Hue is not decoration here, it names the verb the number points at:
 * `behind` wears the Pull face's amber (incoming work worth a second of
 * caution), `ahead` the Push face's green (outgoing work you completed). Both
 * hues come from the `--pull-face` / `--push-face` tokens every theme ships,
 * so a re-ink re-lights the chips along with the verbs they point to. On a
 * filled verb face the chips take the inverted on-accent treatment instead —
 * there the button's own face is already the hue.
 *
 * Order is ↓ before ↑ everywhere, matching the Pull-before-Push story the
 * compound verb runs. A zero count renders nothing: `↓0` is noise, and an
 * all-zero pair renders no group at all.
 *
 * The chips are always `aria-hidden` and their `title` carries the sentence
 * from divergence.ts for a sighted hover; whatever control hosts them has to
 * speak the same words (`aria-label` on the sync verb, `branchAriaLabel` on a
 * branch row), so the glyphs are never the only channel.
 */

/**
 * The chips themselves. Returns null when there is nothing to say, so callers
 * can drop the whole group into a flex row without an empty wrapper.
 *
 * `reference` appears only in the tooltip — what the counts compare against,
 * which is the one thing two arrows and two digits cannot say for themselves.
 */
export function DivergenceChips({
  ahead,
  behind,
  reference,
  quiet = false
}: {
  readonly ahead: number | undefined
  readonly behind: number | undefined
  /** What the counts compare against — the sentence's tail. */
  readonly reference?: string
  /** Neutral face instead of the verb hues, for a secondary comparison. */
  readonly quiet?: boolean
}): JSX.Element | null {
  if (ahead === undefined || behind === undefined) return null
  if (ahead <= 0 && behind <= 0) return null
  const title = `${divergenceSentence(ahead, behind)}${
    reference === undefined ? '' : ` to ${reference}`
  }`
  const suffix = quiet ? ' quiet' : ''
  return (
    <>
      {behind > 0 && (
        <span aria-hidden="true" className={`badge div behind${suffix}`} title={title}>
          ↓{behind}
        </span>
      )}
      {ahead > 0 && (
        <span aria-hidden="true" className={`badge div ahead${suffix}`} title={title}>
          ↑{ahead}
        </span>
      )}
    </>
  )
}

/**
 * The `[gone]` marker: this branch still names an upstream, but the ref is no
 * longer on the remote. Its counts would read `0 0` and claim a sync that is
 * really a stranded branch, so the word replaces the numbers — in caution
 * amber, the same hue the deleted upstream's Pull verb would have worn.
 */
export function UpstreamGoneChip({
  upstream
}: {
  readonly upstream: string
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="badge div gone"
      title={`The upstream branch ${upstream} no longer exists on the remote — pushing republishes it`}
    >
      deleted
    </span>
  )
}

/**
 * The chips a branch row carries, in two explicitly different groups:
 *
 * - **vs the checked-out branch** — tinted, because this is the pair the row's
 *   own Merge verb acts on.
 * - **vs the upstream the row itself tracks** — the neutral `quiet` pair, for
 *   the branch's own remote bookkeeping. Only local branches can have one.
 *
 * The two used to look identical and differed only by 65% opacity, which made
 * `↑3 ↓1` on a row mean whichever of two things the reader happened to guess.
 * Hue now carries the reference, both tooltips spell it out, and a row whose
 * upstream is gone says so in words instead of showing no chips at all.
 */
export function BranchDivergence({
  branch,
  current
}: {
  branch: BranchInfo
  /** Name of the checked-out branch, for the tooltips. */
  current: string
}): JSX.Element | null {
  const vsCurrent = (
    <DivergenceChips
      ahead={branch.ahead}
      behind={branch.behind}
      reference={`"${current}"`}
    />
  )
  const vsUpstream =
    branch.remote === undefined && branch.upstream !== undefined ? (
      branch.upstreamGone === true ? (
        <UpstreamGoneChip upstream={branch.upstream} />
      ) : (
        <DivergenceChips
          ahead={branch.upstreamAhead}
          behind={branch.upstreamBehind}
          reference={branch.upstream}
          quiet
        />
      )
    ) : null

  if (vsCurrent === null && vsUpstream === null) return null
  return (
    <>
      {vsCurrent}
      {vsUpstream}
    </>
  )
}
