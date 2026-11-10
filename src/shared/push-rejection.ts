/**
 * The two shapes of a failed `git push` that have a one-click recovery. The
 * first: the remote branch moved ahead while our local branch did not, so the
 * push is rejected as a non-fast-forward (git's "`! [rejected] … (fetch
 * first)`" and "the tip of your current branch is behind" family). Both mean
 * the same thing to the user — pull first, then push again — so the app
 * answers not with an error but by converting its sync buttons into the
 * compound Pull & Push verb, which runs exactly that recovery on the next
 * click. The second: the remote refused for lack of write permission — the
 * recovery is an in-app fork (see {@link PUSH_NEEDS_FORK_MESSAGE}).
 */

/**
 * The message main throws in place of git's raw rejection output. The
 * renderer keys the pull-recovery toast's buttons on this exact text, so
 * nothing may be appended to or reworded around it here.
 */
export const PUSH_NEEDS_PULL_MESSAGE =
  'Push rejected — the remote branch has commits you do not have locally. ' +
  'Pull first, then push again.'

/**
 * The second push failure with a one-click recovery: the remote answered the
 * push with a *permission* refusal — you cloned someone else's public
 * repository and have no write access to it. GitHub Desktop answers this by
 * offering an in-app fork; Aspen answers the same way, so main replaces git's
 * raw first line (again just "To <remote>") with this constant and the toast
 * grows a Create Fork button. Main only throws it when a signed-in GitHub
 * account serves the remote's host, so the button can never be a dead end.
 */
export const PUSH_NEEDS_FORK_MESSAGE =
  'Push rejected — you do not have write access to this repository. ' +
  'Fork it and push to your fork.'

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

/**
 * True when a push error message is the app's own needs-fork explanation
 * (main replaces git's raw first-line output with the constant only when a
 * signed-in GitHub account could actually carry the fork flow — every other
 * permission failure, e.g. GitLab remotes, stays a plain error).
 */
export function isNeedsForkRejectionMessage(message: string): boolean {
  return message.includes(PUSH_NEEDS_FORK_MESSAGE)
}

/**
 * True when push stderr is GitHub's write-permission refusal — the shape of
 * "you cloned someone else's repository and cannot push to it":
 * `remote: Permission to owner/repo.git denied to user.`, the HTTP 403 git
 * reports when the host rejects the push, and GitHub's older
 * `Write access to repository not granted` line. Deliberately narrow: a
 * non-fast-forward rejection (`isRemoteMovedAhead`) never contains these,
 * and `Permission denied (publickey)` — an ssh *authentication* failure the
 * token-retry path already answers — does not match either.
 */
export function isPushPermissionDenied(stderr: string): boolean {
  return (
    /Permission to\s+\S+\s+denied to\s+\S+/.test(stderr) ||
    /returned error: 403\b/.test(stderr) ||
    /Write access to repository not granted/.test(stderr)
  )
}
