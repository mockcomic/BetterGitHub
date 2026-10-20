/**
 * Data models shared between main and renderer.
 *
 * These mirror the shapes observed in GitHub Desktop's shipped
 * `app/src/models/*` modules (status entries, diffs, commits, commit
 * messages), simplified for this clone.
 */

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
}

export interface BranchInfo {
  readonly name: string
  readonly head: string
  readonly current: boolean
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

/** Result contract returned by the AI commit-message agent. */
export interface GeneratedCommitMessage {
  readonly title: string
  readonly description: string
}

export interface GitConfigInfo {
  readonly name: string | null
  readonly email: string | null
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
  readonly theme: 'system' | 'light' | 'dark'
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
  readonly theme?: 'system' | 'light' | 'dark'
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }
