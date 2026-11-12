/**
 * The attention channel: prompts that wait for the user.
 *
 * The desk answers routine outcomes — commits, pushes, failed discards —
 * with transient corner toasts. A few states do not go away because the
 * toast expired: conflict markers sitting in the worktree, a push rejected
 * as behind the remote, an account the provider no longer accepts, an
 * update waiting. Those raise a modal dialog centered on the screen
 * (see components/AttentionDialog.tsx), which names the affected files and
 * carries the options for handling them.
 *
 * The `conflicts` request deliberately stores no file snapshot: the dialog
 * renders the conflicted list live from `status`, so resolving a file in
 * place shrinks the list and the prompt can never contradict the desk.
 *
 * Pure builders only — no React, no store — so the copy and the title
 * rules unit-test in the node environment like the shared modules.
 */

import type {
  AccountProvider,
  RepositoryStatus,
  WorkflowKind,
  WorkflowState
} from '../../shared/models'

/** Which notice a raised request carries, so the store can retire exactly
 *  that prompt when the underlying state resolves (a later push landing
 *  clears the rejected-push notice without touching an update prompt). */
export type AttentionNoticeId = 'push-rejected' | 'update-available' | 'auth-revoked'

export interface AttentionAction {
  readonly label: string
  readonly onClick: () => void
  /** A request nominates at most one primary verb. */
  readonly primary?: boolean
  /** Verbs that throw work away answer in Alarm Red (DESIGN.md,
   *  "Named Hues Do Jobs"). */
  readonly danger?: boolean
}

export type AttentionRequest =
  | {
      readonly kind: 'conflicts'
      readonly title: string
      /** Which operation paused — `Merging "feat" into "main"`. Absent when
       *  the markers appeared under the desk's feet (an outside edit, a
       *  rebase the terminal started); the title then falls back to the
       *  workflow's own noun, or to the bare count. */
      readonly cause?: string
    }
  | {
      readonly kind: 'notice'
      readonly id: AttentionNoticeId
      readonly title: string
      readonly message: string
      /** The quiet footer out — the prompt interrupts, but the state behind
       *  it stays visible in the desk, so deferring is always allowed. */
      readonly dismissLabel: string
      readonly actions: ReadonlyArray<AttentionAction>
    }

/** A paused operation's display noun — the dialog says `Abort rebase`. */
export function workflowNoun(kind: WorkflowKind): string {
  switch (kind) {
    case 'merge':
      return 'merge'
    case 'rebase':
      return 'rebase'
    case 'revert':
      return 'revert'
    case 'cherryPick':
      return 'cherry-pick'
  }
}

/** Which operation owns the worktree. Rebase first: git's sequencer
 *  directories can coexist and the replay is the one driving the desk —
 *  the same precedence the sidebar's workflow banner uses. */
export function workflowKindOf(inProgress: WorkflowState): WorkflowKind | null {
  if (inProgress.rebase) return 'rebase'
  if (inProgress.merge) return 'merge'
  if (inProgress.revert) return 'revert'
  if (inProgress.cherryPick) return 'cherryPick'
  return null
}

/** Repo-relative conflicted paths, in the order git reported them. */
export function conflictedPaths(status: RepositoryStatus): ReadonlyArray<string> {
  return status.files.filter(f => f.kind === 'conflicted').map(f => f.path)
}

/** The dismissed set's fingerprint: the same files must not re-prompt on
 *  every watcher refresh; a changed set is news, and so is a fresh episode
 *  after the conflict count returns to zero. */
export function conflictSignature(paths: ReadonlyArray<string>): string {
  return [...paths].sort().join('\n')
}

/**
 * The prompt for a repository that just became conflicted. The title names
 * the operation when the failing verb is known (`Pulling into "main"
 * stopped on conflicts`), else the paused workflow, else the bare count —
 * the desk never reports "something happened" without a subject.
 */
export function conflictsAttention(
  status: RepositoryStatus,
  cause?: string
): AttentionRequest {
  const known = cause !== undefined && cause.length > 0 ? cause : null
  const kind = workflowKindOf(status.inProgress)
  const title =
    known !== null
      ? `${known} stopped on conflicts`
      : kind !== null
        ? `Resolve the conflicts to finish the ${workflowNoun(kind)}`
        : status.conflictCount === 1
          ? 'One file is conflicted'
          : `${status.conflictCount} files are conflicted`
  return {
    kind: 'conflicts',
    title,
    ...(known !== null ? { cause: known } : {})
  }
}

/** The cause line a conflicted merge leaves behind for the refresh raise. */
export function mergeAttentionCause(source: string, target: string): string {
  return `Merging "${source}" into "${target}"`
}

/** The same, for a pull that stopped on conflicts. */
export function pullAttentionCause(branch: string): string {
  return `Pulling into "${branch}"`
}

/**
 * A push rejected only because the remote moved ahead. The footer carries
 * the whole recovery (Pull & Push); Later is honest because the toolbar's
 * compound verb stays on the git truth after the prompt closes.
 */
export function pushRejectedAttention(pullAndPush: () => void): AttentionRequest {
  return {
    kind: 'notice',
    id: 'push-rejected',
    title: 'Push rejected — the remote moved ahead',
    message:
      'The remote branch has commits you do not have locally. ' +
      'Pull first, then push again.',
    dismissLabel: 'Later',
    actions: [{ label: 'Pull & Push', primary: true, onClick: pullAndPush }]
  }
}

/** Accounts whose stored token the provider rejected. */
export function authRevokedAttention(
  accounts: ReadonlyArray<{ login: string; provider: AccountProvider }>,
  signIn: () => void
): AttentionRequest {
  const who = accounts
    .map(a => `${a.provider === 'github' ? 'GitHub' : 'GitLab'} · ${a.login}`)
    .join(' and ')
  return {
    kind: 'notice',
    id: 'auth-revoked',
    title: 'Signed out',
    message: `${who} no longer accepts the stored token. Sign in again to restore hosted fetch, push and repository features.`,
    dismissLabel: 'Later',
    actions: [{ label: 'Sign in', primary: true, onClick: signIn }]
  }
}

/** The page-only update tier: this install cannot self-update, so the
 *  prompt links out to the releases page instead of downloading. */
export function updateAvailableAttention(
  version: string | null,
  openReleases: () => void
): AttentionRequest {
  return {
    kind: 'notice',
    id: 'update-available',
    title: 'Update available',
    message: `Aspen ${version ?? 'a newer version'} is available — download it from the releases page.`,
    dismissLabel: 'Later',
    actions: [{ label: 'Open releases', primary: true, onClick: openReleases }]
  }
}
