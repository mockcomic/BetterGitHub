/**
 * Data models shared between main and renderer.
 *
 * These mirror the shapes observed in GitHub Desktop's shipped
 * `app/src/models/*` modules (status entries, diffs, commits, commit
 * messages), simplified for this clone.
 */

import type { ThemeId } from './themes'

/** UI-facing classification of a file's git status. */
export type FileStatusKind =
  | 'new' // untracked or added in index
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed'
  | 'conflicted'

export interface FileStatus {
  /** Repository-relative path (forward slashes). */
  readonly path: string
  /** For renames/copies, the original path. */
  readonly oldPath?: string
  /** Index-vs-HEAD code (porcelain v2 X field). */
  readonly indexCode: string
  /** Worktree-vs-index code (porcelain v2 Y field). */
  readonly worktreeCode: string
  readonly kind: FileStatusKind
  /** True when the file has staged changes (X != '.'). */
  readonly staged: boolean
  /** True when the file has uncommitted worktree changes (Y != '.'). */
  readonly hasWorktreeChanges: boolean
  /** True when the file is untracked ('??'). */
  readonly untracked: boolean
}

/** Which long-running git operation (if any) is paused in the worktree. */
export interface WorkflowState {
  readonly merge: boolean
  readonly rebase: boolean
  readonly cherryPick: boolean
  readonly revert: boolean
}

export type WorkflowKind = 'merge' | 'rebase' | 'cherryPick' | 'revert'

export interface RepositoryStatus {
  /** Branch name, or '(detached)' when detached HEAD. */
  readonly branch: string
  readonly oid: string
  /** e.g. 'origin/main' when tracking an upstream. */
  readonly upstream?: string
  readonly ahead: number
  readonly behind: number
  readonly detached: boolean
  readonly files: ReadonlyArray<FileStatus>
  /** Files currently carrying merge conflict markers (porcelain `u` records). */
  readonly conflictCount: number
  /** True when MERGE_HEAD / rebase dirs / CHERRY_PICK_HEAD exist. */
  readonly inProgress: WorkflowState
}

export interface BranchInfo {
  readonly name: string
  readonly head: string
  readonly current: boolean
  /** For remote branches: the remote name ('origin'), absent for locals. */
  readonly remote?: string
}

/** Local + remote branches, as returned by the getBranches channel. */
export interface BranchList {
  readonly local: ReadonlyArray<BranchInfo>
  readonly remote: ReadonlyArray<BranchInfo>
}

/** A single `git stash` entry. */
export interface StashEntry {
  /** Zero-based index; used to build the `stash@{n}` ref. */
  readonly index: number
  /** The `stash@{n}` label as git prints it. */
  readonly label: string
  /** The stash subject, e.g. `On main: my changes`. */
  readonly message: string
  /** ISO 8601 commit date of the stash commit. */
  readonly date: string
  /** Branch the stash was created on. */
  readonly branch: string
}

/** Filters/paging for the commit log. */
export interface LogQuery {
  readonly maxCount?: number
  readonly skip?: number
  /** Case-insensitive substring match on the commit message. */
  readonly search?: string
  /** Case-insensitive substring match on author name or email. */
  readonly author?: string
}

export interface CommitInfo {
  readonly sha: string
  readonly parents: ReadonlyArray<string>
  readonly authorName: string
  readonly authorEmail: string
  /** ISO 8601 author date. */
  readonly date: string
  readonly summary: string
  readonly body: string
  readonly isMerge: boolean
}

export interface Repository {
  readonly id: string
  readonly path: string
  readonly name: string
}

/**
 * A repository as shown in the repository manager: every stored entry plus a
 * computed `missing` flag for folders that no longer exist on disk. (The
 * stored shape in settings.json stays a plain {@link Repository}.)
 */
export interface ManagedRepository extends Repository {
  readonly missing: boolean
}

/** Per-item outcome of a bulk `addRepositories` call. */
export interface AddRepositoriesResult {
  readonly added: ReadonlyArray<Repository>
  /** Folders already present in the list (not an error). */
  readonly skipped: ReadonlyArray<Repository>
  /** Folders rejected (typically: not a git repository). */
  readonly failed: ReadonlyArray<{ path: string; error: string }>
}

/** Outcome of a bulk `removeRepositories` call. */
export interface RemoveRepositoriesResult {
  /** How many entries left the settings list. */
  readonly removed: number
  /** Folders that stayed on disk because trashing them failed. */
  readonly trashFailed: ReadonlyArray<{ path: string; error: string }>
}

/**
 * Live git truth for one repository row in the repository manager hub.
 * Produced by the `getRepoSummaries` channel; never guessed — a folder whose
 * git commands fail reports `unreadable` with empty cells instead of zeroes.
 */
export interface RepoSummary {
  /** Branch name ('(detached)' when detached HEAD); null when unreadable. */
  readonly branch: string | null
  /** Changed files in the working tree (porcelain records). */
  readonly dirty: number
  /** Files currently carrying conflict markers. */
  readonly conflicts: number
  /** Commits the checked-out branch is ahead of its upstream. */
  readonly ahead: number
  /** Commits the checked-out branch is behind its upstream. */
  readonly behind: number
  /** False when the branch tracks no upstream (push would set one). */
  readonly hasUpstream: boolean
  /** ISO 8601 date of the tip commit; null when the repo has no commits. */
  readonly lastCommitAt: string | null
  readonly unreadable: boolean
}

export interface RepoSummaryEntry {
  readonly path: string
  readonly summary: RepoSummary
}

/** Result contract returned by the AI commit-message agent. */
export interface GeneratedCommitMessage {
  readonly title: string
  readonly description: string
}

export interface GitConfigInfo {
  readonly name: string | null
  readonly email: string | null
}

/** What "View on GitHub" should link to. */
export type GitHubTarget =
  | { readonly kind: 'repo' }
  | { readonly kind: 'branch'; readonly branch: string }
  | { readonly kind: 'commit'; readonly sha: string }
  | { readonly kind: 'compare'; readonly branch: string; readonly base: string }

/** Public (renderer-visible) settings. The API key never leaves main. */
export interface PublicSettings {
  readonly ai: {
    readonly baseUrl: string
    readonly model: string
    readonly customInstructions: string
    readonly hasApiKey: boolean
  }
  readonly confirmOverrideWithGeneratedMessage: boolean
  readonly autoRefresh: boolean
  readonly theme: ThemeId
}

export interface SettingsPatch {
  readonly ai?: {
    readonly baseUrl?: string
    readonly model?: string
    readonly customInstructions?: string
    /** undefined = leave unchanged, '' = clear. */
    readonly apiKey?: string
  }
  readonly confirmOverrideWithGeneratedMessage?: boolean
  readonly autoRefresh?: boolean
  readonly theme?: ThemeId
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }
