import type {
  AddRepositoriesResult,
  BranchList,
  CommitInfo,
  ExternalApp,
  FilePreview,
  FileStatus,
  GeneratedCommitMessage,
  GitHubTarget,
  GitConfigInfo,
  GitignoreResult,
  IgnoreRequest,
  IpcResult,
  LogQuery,
  ManagedRepository,
  PublicSettings,
  RemoveRepositoriesResult,
  RepoSummaryEntry,
  Repository,
  RepositoryStatus,
  SettingsPatch,
  StashEntry,
  WorkflowKind
} from './models'

/**
 * The typed renderer -> main request/response contract.
 *
 * Mirrors the pattern observed in GitHub Desktop's `main-process/ipc-main.ts`:
 * a single map of channel names to function signatures, with handlers on the
 * main side and a contextBridge proxy on the preload side.
 *
 * Signatures describe the resolved data; the wire value is an
 * {@link IpcResult} envelope so error strings survive the bridge.
 */
export interface RequestResponseChannels {
  // repositories / settings
  /** All stored repos, including ones whose folder is missing on disk. */
  listRepositories: () => ManagedRepository[]
  addRepository: (path: string) => Repository
  /** Native multi-select directory picker; null when cancelled. */
  selectDirectories: () => ReadonlyArray<string> | null
  /** Bulk add used by the repository manager (validates each folder). */
  addRepositories: (paths: ReadonlyArray<string>) => AddRepositoriesResult
  /** Live status for the manager hub list; one bounded batch per call. */
  getRepoSummaries: (paths: ReadonlyArray<string>) => RepoSummaryEntry[]
  /**
   * Bulk remove. Deletion is id-based so the renderer can only target folders
   * already stored in settings; `deleteFromDisk` moves each folder that still
   * exists to the OS Recycle Bin.
   */
  removeRepositories: (
    ids: ReadonlyArray<string>,
    deleteFromDisk: boolean
  ) => RemoveRepositoriesResult
  getSettings: () => PublicSettings
  saveSettings: (patch: SettingsPatch) => PublicSettings
  selectDirectory: () => string | null
  testAiConnection: (config?: {
    baseUrl: string
    model: string
    apiKey?: string
  }) => { ok: boolean; message: string }
  suggestCloneFolder: (url: string) => string

  // filesystem watching (main pushes REPO_CHANGED_CHANNEL)
  startWatching: (repoPath: string) => void
  stopWatching: () => void

  // status / staging
  getStatus: (repoPath: string) => RepositoryStatus
  stagePaths: (repoPath: string, paths: ReadonlyArray<string>) => void
  unstagePaths: (repoPath: string, paths: ReadonlyArray<string>) => void
  discardPaths: (repoPath: string, paths: ReadonlyArray<string>) => void
  /** Pick one side of a conflict (or just stage it as resolved). */
  resolveConflict: (
    repoPath: string,
    path: string,
    side: 'ours' | 'theirs' | 'resolved'
  ) => void
  /**
   * Append .gitignore rule(s) for a path according to the requested scope
   * (exact file, name/extension anywhere, folder subtree, folder contents,
   * depth-limited extension glob, or every untracked file).
   */
  addToGitignore: (
    repoPath: string,
    path: string,
    request: IgnoreRequest
  ) => GitignoreResult

  // diffs
  /** Diff of a single path vs HEAD; synthesized +diff for untracked files. */
  getPathDiff: (
    repoPath: string,
    path: string,
    oldPath?: string
  ) => string
  /** Raw unified diff text for a path within a commit. */
  getCommitFileDiff: (repoPath: string, sha: string, path: string) => string
  getCommitFiles: (repoPath: string, sha: string) => FileStatus[]
  /**
   * Media preview bytes for image/video/audio files — the working-tree file,
   * or the blob in commit `sha`'s tree when one is given. Null for anything
   * the previewer doesn't handle or that vanished since the listing.
   */
  getPreview: (repoPath: string, path: string, sha?: string) => FilePreview | null

  // committing
  commitPaths: (
    repoPath: string,
    summary: string,
    description: string,
    paths: ReadonlyArray<string>
  ) => string
  amendCommit: (
    repoPath: string,
    summary: string,
    description: string,
    paths: ReadonlyArray<string>,
    expectedSha?: string
  ) => string
  /** Soft-reset the tip, but only while HEAD is still `expectedSha`. */
  undoLastCommit: (repoPath: string, expectedSha: string) => void
  revertCommit: (repoPath: string, sha: string) => void
  cherryPickCommit: (repoPath: string, sha: string) => void

  // paused operations (merge / rebase / cherry-pick / revert)
  continueOperation: (repoPath: string, kind: WorkflowKind) => void
  abortOperation: (repoPath: string, kind: WorkflowKind) => void

  // stash
  listStashes: (repoPath: string) => StashEntry[]
  stashAll: (repoPath: string, message?: string) => void
  applyStash: (repoPath: string, index: number) => void
  popStash: (repoPath: string, index: number) => void
  dropStash: (repoPath: string, index: number) => void

  // branches
  getBranches: (repoPath: string) => BranchList
  checkoutBranch: (repoPath: string, name: string, fromRemote?: string) => void
  /** Merge a branch into HEAD; resolves with git's merge output. */
  mergeBranch: (repoPath: string, name: string, fromRemote?: string) => string
  createBranch: (repoPath: string, name: string, startPoint?: string) => void
  deleteBranch: (repoPath: string, name: string, force: boolean) => void
  renameBranch: (repoPath: string, oldName: string, newName: string) => void
  deleteRemoteBranch: (repoPath: string, remote: string, name: string) => void

  // history
  getLog: (repoPath: string, query?: LogQuery) => CommitInfo[]

  // sync
  fetch: (repoPath: string) => string
  push: (repoPath: string) => string
  pull: (repoPath: string) => string
  getRemoteUrl: (repoPath: string) => string | null
  addRemote: (repoPath: string, url: string) => void
  getConfigInfo: (repoPath: string) => GitConfigInfo
  setConfigInfo: (repoPath: string, name: string, email: string) => void
  cloneRepository: (url: string, destinationPath: string) => string
  /** Resolve a GitHub-style web URL from origin and open it externally. */
  viewOnGitHub: (repoPath: string, target: GitHubTarget) => void

  // shell integration
  revealInFolder: (repoPath: string, path: string) => void
  openFile: (repoPath: string, path: string) => void
  openExternal: (url: string) => void
  writeClipboard: (text: string) => void
  /**
   * Launch targets for the strip's "Open in" button: the OS file manager and
   * source editors detected on this machine, main-cached; `refresh` re-scans.
   */
  listExternalApps: (refresh?: boolean) => ExternalApp[]
  /** Launch a detected target with the repository root (by catalog id). */
  openInExternalApp: (repoPath: string, appId: string) => void

  // Window-frame menu (win32 WCO title band, components/TitleBar.tsx):
  // main owns the menu data (src/main/menu.ts); the band asks for the
  // declarative menu bar, forwards plain actions exactly like the native
  // menu bar's click handlers do, and delegates role items (undo, zoom,
  // fullscreen…) back to main's WebContents implementations.
  getMenuBar: () => MenuBarSpec[]
  triggerMenuAction: (action: MenuAction) => void
  runMenuRole: (role: MenuRole) => void

  // AI commit messages
  generateCommitMessage: (
    repoPath: string,
    paths: ReadonlyArray<string>
  ) => GeneratedCommitMessage
  cancelGenerateCommitMessage: (repoPath: string) => void
}

export type RequestResponseChannel = keyof RequestResponseChannels

/** Wire envelope type for a channel's result. */
export type ChannelResult<K extends RequestResponseChannel> = IpcResult<
  Awaited<ReturnType<RequestResponseChannels[K]>>
>

/** Menu actions the main process forwards to the renderer. */
export type MenuAction =
  | 'commit'
  | 'stage-all'
  | 'unstage-all'
  | 'refresh'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'new-branch'
  | 'merge-branch'
  | 'show-preferences'
  | 'add-repository'
  | 'clone-repository'
  | 'manage-repositories'
  | 'stash-all'
  | 'edit-last-commit'
  | 'undo-commit'
  | 'copy-sha'
  | 'revert-commit'
  | 'cherry-pick-commit'
  | 'create-branch-from-commit'
  | 'delete-branch'
  | 'rename-branch'
  | 'view-on-github'
  | 'show-about'
  | 'donate'

export const MENU_ACTION_CHANNEL = 'menu-action'

/**
 * The menu roles the title band's dropdowns delegate back to main — a
 * deliberate subset of Electron's MenuItemRoles (WebContents/BrowserWindow
 * primitives; src/main/menu.ts runMenuRole).
 */
export type MenuRole =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'reload'
  | 'toggleDevTools'
  | 'resetZoom'
  | 'zoomIn'
  | 'zoomOut'
  | 'togglefullscreen'
  | 'close'
  | 'quit'

/** One entry of a title-band dropdown: item, separator, or both-void gap. */
export interface MenuEntrySpec {
  readonly label?: string
  /** Display-only shortcut hint (already platform-spelled, e.g. 'Ctrl+Z'). */
  readonly accelerator?: string
  /** Forwarded to the renderer's menu-action dispatcher via main. */
  readonly action?: MenuAction
  /** Handled by main against the window's WebContents. */
  readonly role?: MenuRole
  readonly separator?: boolean
}

/** One top-level menu: the band label plus its dropdown entries. */
export interface MenuBarSpec {
  readonly label: string
  readonly items: ReadonlyArray<MenuEntrySpec>
}

/** Main -> renderer push: the working tree of a watched repository changed. */
export const REPO_CHANGED_CHANNEL = 'repo-changed'
