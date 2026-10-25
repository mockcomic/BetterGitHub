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

/**
 * What the context menu's Ignore submenu asked for. Rules are always written
 * to the repository-root `.gitignore`; `extensionInFolder` limits how many
 * directory levels below the containing folder the rule reaches.
 */
export type IgnoreRequest =
  /** Exact repo-relative path (directories get a trailing `/`). */
  | { mode: 'file' }
  /** Basename rule with no directory part — matches at any depth. */
  | { mode: 'name' }
  /** `*.ext` basename rule — matches at any depth. */
  | { mode: 'extension' }
  /** `<dir>/` — the containing folder and its whole subtree. */
  | { mode: 'folder' }
  /** `<dir>/*` — direct children; a matched subdirectory hides its contents. */
  | { mode: 'folderDirect' }
  /** `<firstSegment>/` — the repo-root-level folder containing the path. */
  | { mode: 'rootFolder' }
  /**
   * `*.ext` scoped to the containing folder: depth 1 covers the folder
   * itself, depth n adds one wildcard directory per level (cumulative
   * rules), `'any'` uses the `dir/ext-glob` doublestar form.
   */
  | { mode: 'extensionInFolder'; depth: 1 | 2 | 3 | 'any' }
  /** Every currently untracked path from the working-tree status. */
  | { mode: 'allUntracked' }

/** Outcome of an addToGitignore request. */
export interface GitignoreResult {
  /** Rules newly written; empty when every rule was already present. */
  readonly appended: ReadonlyArray<string>
  /**
   * Tracked files inside the rule's scope. `.gitignore` never hides tracked
   * files, so these stay visible in the changes list until untracked.
   */
  readonly trackedInScope: number
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
  /**
   * Commits this branch is ahead of the checked-out branch (branch-only
   * commits). Undefined when no comparison is possible: the current branch
   * itself, a detached HEAD, or a repo without commits yet.
   */
  readonly ahead?: number
  /** Commits the checked-out branch has that this branch lacks. */
  readonly behind?: number
  /** Tracking upstream ref name ('origin/main'), when the branch has one. */
  readonly upstream?: string
  /**
   * Ahead/behind of the tracking upstream from `%(upstream:track)`.
   * Undefined when the branch tracks nothing or its upstream is gone.
   */
  readonly upstreamAhead?: number
  readonly upstreamBehind?: number
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

/**
 * One launchable target in the "Open in" strip button, detected at runtime by
 * the main process (src/main/external-apps.ts). An app is only ever listed
 * when its probe actually found it on this machine — never assumed, so a row
 * in the dropdown is never a dead click.
 */
export interface ExternalApp {
  /** Catalog key (e.g. 'code', 'cursor', 'files'); the launch allowlist. */
  readonly id: string
  /** Display name, e.g. 'Visual Studio Code'. */
  readonly label: string
  /** OS file manager vs. a source editor; also drives popover grouping. */
  readonly kind: 'files' | 'editor'
}

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
