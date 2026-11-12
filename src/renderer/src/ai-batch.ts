/**
 * The batch pass over every conflicted file — "✨ Resolve all with AI".
 *
 * The one-file agent (src/main/ai/merge-agent.ts) may answer with questions,
 * which is exactly what a batch cannot handle: nobody is sitting in front of a
 * dialog for file six of nine. So the pass runs the agent in forced mode and
 * files an `asked` result instead of starting a conversation; the leftovers
 * keep their own per-file ✨ AI button, where asking is cheap.
 *
 * Pure state shapes and copy, like `attention.ts` / `progressive.ts`: the
 * store drives the loop, and everything a reader is told is built here so the
 * wording unit-tests without a renderer.
 */

/** What the agent did with one conflicted file during a batch pass. */
export interface AiBatchOutcome {
  readonly path: string
  /**
   * `resolved` — merged, written and staged by main. `asked` — the agent
   * refused to guess and wants answers. `failed` — an error (binary or
   * oversized stage, an endpoint rejection, the file already un-conflicted).
   */
  readonly kind: 'resolved' | 'asked' | 'failed'
  /** The agent's summary, its reason for asking, or the error text. */
  readonly detail: string
}

/** Live state of a running pass, so the queue can say where it has got to. */
export interface AiBatchState {
  /** How many files the pass started with — it never picks up new ones. */
  readonly total: number
  /** The path being merged right now; that row wears the spinner. */
  readonly current: string
  /** Every file already answered, in the order the pass walked them. */
  readonly outcomes: ReadonlyArray<AiBatchOutcome>
}

/** Same vocabulary as `Toast['kind']`, so the report can be toasted directly. */
export type AiBatchTone = 'info' | 'error' | 'success'

export interface AiBatchReport {
  readonly tone: AiBatchTone
  readonly message: string
  readonly resolved: number
  /** Conflicts the pass did not clear — still conflicted on git's word. */
  readonly left: number
}

/**
 * The one line a finished (or stopped) pass leaves behind. Counts lead, the
 * reason follows only when the pass cleared nothing: the desk still shows every
 * file it did not resolve, so the toast answers "how much happened", not
 * "which files" — and each leftover row can be asked again on its own.
 */
export function summarizeAiBatch(
  outcomes: ReadonlyArray<AiBatchOutcome>,
  total: number,
  mode: 'finished' | 'stopped' = 'finished'
): AiBatchReport {
  const resolved = outcomes.filter(o => o.kind === 'resolved').length
  const asked = outcomes.filter(o => o.kind === 'asked').length
  const failed = outcomes.find(o => o.kind === 'failed')
  const left = Math.max(0, total - resolved)

  if (mode === 'stopped') {
    return {
      tone: 'info',
      resolved,
      left,
      message:
        resolved === 0
          ? 'Stopped before the AI merge agent finished any conflict.'
          : `Stopped — AI merged ${resolved} of ${total} conflicts.`
    }
  }

  if (left === 0) {
    return {
      tone: 'success',
      resolved,
      left,
      message:
        total === 1
          ? 'AI merged the conflict.'
          : `AI merged all ${total} conflicts.`
    }
  }

  if (resolved === 0) {
    // Nothing landed, so the reader needs the reason, not a fraction.
    if (asked === outcomes.length && failed === undefined) {
      return {
        tone: 'error',
        resolved,
        left,
        message: total === 1
          ? 'The AI merge agent would not guess this one — ask it file by file and it can ask you back.'
          : `The AI merge agent would not guess on any of the ${total} conflicts — ask it file by file and it can ask you back.`
      }
    }
    return {
      tone: 'error',
      resolved,
      left,
      message: `The AI merge agent merged none of the ${total} conflicts — ${failed?.detail ?? 'the agent answered nothing usable.'}`
    }
  }

  return {
    tone: 'info',
    resolved,
    left,
    message: `AI merged ${resolved} of ${total} conflicts — ${left} still ${left === 1 ? 'needs' : 'need'} you.`
  }
}
