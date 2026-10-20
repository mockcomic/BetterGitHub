import type {
  BranchInfo,
  CommitInfo,
  FileStatus,
  GeneratedCommitMessage,
  GitConfigInfo,
  IpcResult,
  PublicSettings,
  Repository,
  RepositoryStatus,
  SettingsPatch
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
  listRepositories: () => Repository[]
  addRepository: (path: string) => Repository
  removeRepository: (id: string) => void
  getSettings: () => PublicSettings
  saveSettings: (patch: SettingsPatch) => PublicSettings
  selectDirectory: () => string | null
  testAiConnection: () => { ok: boolean; message: string }

  // status / staging
  getStatus: (repoPath: string) => RepositoryStatus
  stagePaths: (repoPath: string, paths: ReadonlyArray<string>) => void
  unstagePaths: (repoPath: string, paths: ReadonlyArray<string>) => void
  discardPaths: (repoPath: string, paths: ReadonlyArray<string>) => void

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

  // committing
  commitPaths: (
    repoPath: string,
    summary: string,
    description: string,
    paths: ReadonlyArray<string>
  ) => string

  // branches
  getBranches: (repoPath: string) => BranchInfo[]
  checkoutBranch: (repoPath: string, name: string) => void
  createBranch: (repoPath: string, name: string) => void

  // history
  getLog: (repoPath: string, maxCount?: number) => CommitInfo[]

  // sync
  fetch: (repoPath: string) => string
  push: (repoPath: string) => string
  pull: (repoPath: string) => string
  getRemoteUrl: (repoPath: string) => string | null
  getConfigInfo: (repoPath: string) => GitConfigInfo
  cloneRepository: (url: string, destinationPath: string) => string

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
  | 'show-preferences'
  | 'add-repository'
  | 'clone-repository'

export const MENU_ACTION_CHANNEL = 'menu-action'
