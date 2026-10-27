/**
 * The one shape of a failed `git push` that has a one-click recovery: the
 * remote branch moved ahead while our local branch did not, so the push is
 * rejected as a non-fast-forward (git's "`! [rejected] … (fetch first)`" and
 * "the tip of your current branch is behind" family). Both mean the same
 * thing to the user — pull first, then push again — so the app answers with
 * a toast that offers exactly that.
 */

/**
 * The message main throws in place of git's raw rejection output. The
 * renderer keys the pull-recovery toast's buttons on this exact text, so
 * nothing may be appended to or reworded around it here.
 */
export const PUSH_NEEDS_PULL_MESSAGE =
  'Push rejected — the remote branch has commits you do not have locally. ' +
  'Pull first, then push again.'

/** True when push stderr is git's non-fast-forward / "fetch first" rejection. */
export function isRemoteMovedAhead(stderr: string): boolean {
  if (!/\[rejected\]/.test(stderr)) return false
  return (
    /fetch first/.test(stderr) ||
    /non-fast-forward/.test(stderr) ||
    /tip of your current branch is behind/.test(stderr) ||
    /remote contains work that you do not have/.test(stderr)
  )
}

/**
 * True when a push error message is the app's own needs-pull explanation
 * (main replaces git's raw first-line output with the constant, so an exact
 * match is the detection — other rejections, like a protected branch, stay
 * plain errors with no pull button).
 */
export function isNeedsPullRejectionMessage(message: string): boolean {
  return message.includes(PUSH_NEEDS_PULL_MESSAGE)
}
