import {
  createContext,
  useContext,
  useSyncExternalStore
} from 'react'
import type {
  AccountInfo,
  AccountProvider,
  BranchInfo,
  CommitInfo,
  ExternalApp,
  FilePreview,
  FileStatus,
  GeneratedCommitMessage,
  GitConfigInfo,
  GitHubTarget,
  GitignoreResult,
  IgnoreRequest,
  ManagedRepository,
  MergeAnswer,
  MergeExchange,
  MergeQuestion,
  PublicSettings,
  RemoteRepoPage,
  RemoteRepoSort,
  RepoScanOutcome,
  Repository,
  RepositoryStatus,
  SettingsPatch,
  SignInChallenge,
  StashEntry,
  WorkflowKind
} from '../../shared/models'
import type { MenuAction } from '../../shared/ipc'
import type { ThemeId } from '../../shared/themes'
import { themeBase } from '../../shared/themes'
import { DONATE_URL } from '../../shared/links'
import { RELEASES_URL, type UpdateState } from '../../shared/updates'
import { isNeedsPullRejectionMessage } from '../../shared/push-rejection'
import { aiLooksUnconfigured } from './progressive'
import { call, onMenuAction, onRepoChanged, onReposChanged, onUpdateState } from './api'

export interface ToastAction {
  readonly label: string
  readonly onClick: () => void
}

export interface Toast {
  readonly id: number
  readonly kind: 'info' | 'error' | 'success'
  readonly text: string
  /** Buttons rendered inside the toast (e.g. Undo after a commit). */
  readonly actions?: ReadonlyArray<ToastAction>
}

export interface ConfirmRequest {
  readonly title: string
  readonly message: string
  readonly confirmLabel: string
  /**
   * The verb's own colour. Confirmations that throw work away answer in Alarm
   * Red; confirmations that keep or create work stay Commit Green — see
   * DESIGN.md, "Named Hues Do Jobs".
   */
  readonly tone?: 'danger'
  /** Optional second, destructive-flavoured button ("Delete anyway"). */
  readonly altLabel?: string
  readonly onAlt?: () => void
  readonly onConfirm: () => void
}

/** The four work modes of the command desk. */
export type DeskView = 'review' | 'history' | 'conflicts' | 'stash'

/**
 * The AI merge agent's conversation for one conflicted file. While `busy`
 * the agent is thinking; when `questions` is set it is waiting for answers;
 * `error` is shown inline in the dialog with a retry.
 */
export interface AiMergeState {
  readonly path: string
  readonly busy: boolean
  readonly questions: ReadonlyArray<MergeQuestion> | null
  /** Completed ask/answer rounds, replayed to the agent on each call. */
  readonly exchanges: ReadonlyArray<MergeExchange>
  readonly error: string | null
}

/**
 * Which one-time coaching moments this install has already passed. Stored in
 * renderer localStorage like the layout widths and drafts: they record a
 * reader's progress, not git state, so they never round-trip through main.
 */
export interface HintFlags {
  readonly firstCommitDone: boolean
  readonly firstPushDone: boolean
  readonly coachingDismissed: boolean
}

const HINT_FLAGS: ReadonlyArray<keyof HintFlags> = [
  'firstCommitDone',
  'firstPushDone',
  'coachingDismissed'
]

function readHintFlags(): HintFlags {
  const flags = {
    firstCommitDone: false,
    firstPushDone: false,
    coachingDismissed: false
  } as Record<keyof HintFlags, boolean>
  for (const key of HINT_FLAGS) {
    try {
      flags[key] = localStorage.getItem(`aspen.hints.${key}`) === '1'
    } catch {
      /* storage unavailable: the hint just shows again */
    }
  }
  return flags
}

function writeHintFlag(key: keyof HintFlags, value: boolean): void {
  try {
    localStorage.setItem(`aspen.hints.${key}`, value ? '1' : '0')
  } catch {
    /* best-effort persistence */
  }
}

export interface RepoDraft {
  summary: string
  description: string
  checked: Set<string>
}

/** A commit message draft being rewritten in place. */
export interface AmendState {
  readonly sha: string
  readonly summary: string
  readonly description: string
}

/** What the commit box just produced, so the toast can offer an undo. */
export interface LastCommitState {
  readonly sha: string
  readonly summary: string
  readonly description: string
  readonly paths: ReadonlyArray<string>
}

export interface AppState {
  /** Every stored repository, including folders missing on disk (flagged). */
  readonly repositories: ReadonlyArray<ManagedRepository>
  readonly selectedRepo: Repository | null
  readonly status: RepositoryStatus | null
  readonly statusError: string | null
  readonly branches: ReadonlyArray<BranchInfo>
  readonly remoteBranches: ReadonlyArray<BranchInfo>
  readonly branchesError: string | null
  readonly commits: ReadonlyArray<CommitInfo>
  readonly commitsLoading: boolean
  readonly logError: string | null
  readonly logSearch: string
  readonly logAuthor: string
  readonly logExhausted: boolean
  readonly view: DeskView
  /** Text in the command strip's filter; scopes the current view. */
  readonly deskFilter: string
  readonly selectedStashIndex: number | null
  /** Line-count stats behind the commit tray's scope line (`N of M · +A −D`). */
  readonly scopeAdds: number
  readonly scopeDels: number
  readonly scopeLoading: boolean
  readonly selectedFilePath: string | null
  readonly selectedFileDiff: string | null
  readonly selectedFileError: string | null
  /** Media preview bytes when the selected file is an image/video/audio. */
  readonly selectedFilePreview: FilePreview | null
  readonly selectedCommit: CommitInfo | null
  readonly commitFiles: ReadonlyArray<FileStatus>
  readonly commitFilesLoading: boolean
  readonly commitFilesError: string | null
  readonly selectedCommitFilePath: string | null
  readonly selectedCommitFileDiff: string | null
  readonly selectedCommitFileError: string | null
  /** Media preview bytes from the selected commit's tree. */
  readonly selectedCommitFilePreview: FilePreview | null
  readonly drafts: ReadonlyMap<string, RepoDraft>
  readonly amend: AmendState | null
  readonly lastCommit: LastCommitState | null
  readonly stashes: ReadonlyArray<StashEntry>
  readonly identity: GitConfigInfo | null
  readonly remoteUrl: string | null
  /**
   * Targets for the strip's "Open in" menu: whatever the main process
   * detected on this machine. Refreshed when the dropdown opens; an empty
   * list simply means no supported editors were found.
   */
  readonly externalApps: ReadonlyArray<ExternalApp>
  /**
   * Whether the integrated terminal panel is docked under the desk. Kept
   * in localStorage like the layout widths — it records a preference, not
   * git state. The session itself lives in main (src/main/terminal.ts);
   * the panel component owns its xterm instance and IPC.
   */
  readonly terminalOpen: boolean
  readonly busy: string | null
  readonly aiBusy: boolean
  /** The AI merge agent's live conversation about one conflicted file. */
  readonly aiMerge: AiMergeState | null
  /** Last completing-verb success, so the button that did it can celebrate. */
  readonly celebration: CelebrationPulse | null
  readonly settings: PublicSettings | null
  /** Signed-in hosted accounts (GitHub/GitLab); tokens never cross the bridge. */
  readonly accounts: ReadonlyArray<AccountInfo>
  /**
   * Account avatars as data: URLs (main fetches them so the CSP stays
   * local-only), keyed by account id; absent = not fetched yet, null =
   * unavailable (initials render instead).
   */
  readonly avatars: Readonly<Record<string, string | null>>
  /** An in-flight browser sign-in (device code / PKCE redirect), if any. */
  readonly signIn: SignInChallenge | null
  /** Last sign-in failure, shown inline by the sign-in panel. */
  readonly signInError: string | null
  readonly toasts: ReadonlyArray<Toast>
  readonly showSettings: boolean
  /**
   * The Preferences dialog was opened from ✨ Generate while the AI agent
   * still reads as unconfigured; the dialog shows the pointer note once.
   */
  readonly settingsAiNote: boolean
  readonly hints: HintFlags
  readonly showClone: boolean
  readonly showRepoManager: boolean
  /** The "Stash changes" dialog, opened by the Review toolbar's Stash verb. */
  readonly showStash: boolean
  readonly showNewBranch: boolean
  readonly newBranchBase: string | null
  readonly renameBranchTarget: string | null
  readonly mergeBranchOpen: boolean
  readonly showAbout: boolean
  /** The self-update flow's latest phase (main pushes UPDATE_STATE_CHANNEL). */
  readonly update: UpdateState | null
  readonly confirm: ConfirmRequest | null
  readonly initError: string | null
  readonly lastRefreshedAt: number | null
}

export type CelebrationKind = 'commit' | 'push'

/** A one-shot success signal; the nonce changes on every event so
 *  components can re-trigger even when the same verb fires twice. */
export interface CelebrationPulse {
  readonly kind: CelebrationKind
  readonly nonce: number
}

const initialState: AppState = {
  repositories: [],
  selectedRepo: null,
  status: null,
  statusError: null,
  branches: [],
  remoteBranches: [],
  branchesError: null,
  commits: [],
  commitsLoading: false,
  logError: null,
  logSearch: '',
  logAuthor: '',
  logExhausted: false,
  view: 'review',
  deskFilter: '',
  selectedStashIndex: null,
  scopeAdds: 0,
  scopeDels: 0,
  scopeLoading: false,
  selectedFilePath: null,
  selectedFileDiff: null,
  selectedFileError: null,
  selectedFilePreview: null,
  selectedCommit: null,
  commitFiles: [],
  commitFilesLoading: false,
  commitFilesError: null,
  selectedCommitFilePath: null,
  selectedCommitFileDiff: null,
  selectedCommitFileError: null,
  selectedCommitFilePreview: null,
  drafts: new Map(),
  amend: null,
  lastCommit: null,
  stashes: [],
  identity: null,
  remoteUrl: null,
  externalApps: [],
  terminalOpen: false,
  busy: null,
  aiBusy: false,
  aiMerge: null,
  celebration: null,
  settings: null,
  accounts: [],
  avatars: {},
  signIn: null,
  signInError: null,
  toasts: [],
  showSettings: false,
  settingsAiNote: false,
  showStash: false,
  hints: {
    firstCommitDone: false,
    firstPushDone: false,
    coachingDismissed: false
  },
  showClone: false,
  showRepoManager: false,
  showNewBranch: false,
  newBranchBase: null,
  renameBranchTarget: null,
  mergeBranchOpen: false,
  showAbout: false,
  update: null,
  confirm: null,
  initError: null,
  lastRefreshedAt: null
}

const PAGE_SIZE = 300
const DRAFT_KEY_PREFIX = 'aspen.draft.'

let toastId = 0
let celebrationNonce = 0

function draftKey(repoPath: string): string {
  return `${DRAFT_KEY_PREFIX}${repoPath}`
}

interface StoredDraft {
  summary?: string
  description?: string
  checked?: ReadonlyArray<string>
}

function readStoredDraft(repoPath: string): RepoDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(repoPath))
    if (raw === null) return null
    const parsed = JSON.parse(raw) as StoredDraft
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      checked: new Set(
        Array.isArray(parsed.checked) ? parsed.checked.filter(p => typeof p === 'string') : []
      )
    }
  } catch {
    return null
  }
}

/**
 * Central observable store + action set — a compact take on the
 * AppStore/Dispatcher split observed in the shipped app; per-repository
 * commit drafts mirror its repository state cache and also survive restarts.
 */
const TERMINAL_OPEN_KEY = 'aspen.terminalOpen'

function readTerminalOpen(): boolean {
  try {
    return localStorage.getItem(TERMINAL_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeTerminalOpen(value: boolean): void {
  try {
    localStorage.setItem(TERMINAL_OPEN_KEY, value ? '1' : '0')
  } catch {
    /* storage unavailable: the panel just starts closed next time */
  }
}

export class AppStore {
  private state: AppState = initialState
  private listeners = new Set<() => void>()
  private inited = false
  private draftSaveTimer: ReturnType<typeof setTimeout> | null = null
  private logDebounce: ReturnType<typeof setTimeout> | null = null
  private refreshing = false
  private pendingRefresh = false
  private mediaQuery: MediaQueryList | null = null
  private mediaHandler: ((e: MediaQueryListEvent) => void) | null = null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): AppState => this.state

  private update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  toast(
    kind: Toast['kind'],
    text: string,
    actions?: ReadonlyArray<ToastAction>
  ): void {
    const id = ++toastId
    this.update({ toasts: [...this.state.toasts, { id, kind, text, actions }] })
    const lifetime = actions !== undefined && actions.length > 0 ? 20_000 : kind === 'error' ? 9_000 : 5_000
    setTimeout(() => this.dismissToast(id), lifetime)
  }

  dismissToast(id: number): void {
    this.update({ toasts: this.state.toasts.filter(t => t.id !== id) })
  }

  /** Fire the one-shot success signal for a completing verb (Commit/Push). */
  celebrate(kind: CelebrationKind): void {
    // Passing a verb also retires the matching coaching hint, once, globally.
    const key: keyof HintFlags =
      kind === 'commit' ? 'firstCommitDone' : 'firstPushDone'
    if (!this.state.hints[key]) {
      writeHintFlag(key, true)
      this.update({ hints: { ...this.state.hints, [key]: true } })
    }
    this.update({ celebration: { kind, nonce: ++celebrationNonce } })
  }

  dismissCoaching(): void {
    writeHintFlag('coachingDismissed', true)
    this.update({
      hints: { ...this.state.hints, coachingDismissed: true }
    })
  }

  private draftFor(repoPath: string): RepoDraft {
    const existing = this.state.drafts.get(repoPath)
    if (existing !== undefined) return existing
    const stored = readStoredDraft(repoPath)
    return stored ?? { summary: '', description: '', checked: new Set<string>() }
  }

  private setDraft(repoPath: string, patch: Partial<RepoDraft>): void {
    const drafts = new Map(this.state.drafts)
    const draft = this.draftFor(repoPath)
    const next = { ...draft, ...patch }
    drafts.set(repoPath, next)
    this.update({ drafts })
    this.persistDraft(repoPath, next)
  }

  private persistDraft(repoPath: string, draft: RepoDraft): void {
    if (this.draftSaveTimer !== null) clearTimeout(this.draftSaveTimer)
    this.draftSaveTimer = setTimeout(() => {
      this.draftSaveTimer = null
      try {
        const empty =
          draft.summary.length === 0 &&
          draft.description.length === 0 &&
          draft.checked.size === 0
        if (empty) localStorage.removeItem(draftKey(repoPath))
        else
          localStorage.setItem(
            draftKey(repoPath),
            JSON.stringify({
              summary: draft.summary,
              description: draft.description,
              checked: [...draft.checked]
            })
          )
      } catch {
        /* storage full or unavailable: drafts are a convenience only */
      }
    }, 500)
  }

  private listenersBound = false

  async init(): Promise<void> {
    if (this.inited) return
    this.inited = true
    try {
      const [settings, repositories, accounts] = await Promise.all([
        call('getSettings'),
        call('listRepositories'),
        call('listAccounts')
      ])
      this.update({
        settings,
        repositories,
        accounts,
        initError: null,
        hints: readHintFlags(),
        terminalOpen: readTerminalOpen()
      })
      this.applyTheme(settings.theme)
      // Best-effort pass over the stored accounts: refreshed names/avatars,
      // and a toast for anything the provider now rejects.
      void this.loadAvatars()
      void this.syncAccounts()

      const lastPath = localStorage.getItem('aspen.lastRepo')
      // Missing folders never open silently — the manager surfaces them.
      const usable = repositories.filter(r => !r.missing)
      const selected =
        usable.find(r => r.path === lastPath) ?? usable[0] ?? null
      if (selected !== null) {
        await this.selectRepo(selected)
      }
    } catch (err) {
      this.inited = false // let the error banner's Retry button actually retry
      this.update({
        initError: err instanceof Error ? err.message : String(err)
      })
      this.toast('error', err instanceof Error ? err.message : String(err))
    }

    if (this.listenersBound) return
    this.listenersBound = true
    onMenuAction(action => {
      void this.handleMenuAction(action)
    })

    onReposChanged(outcome => this.applyRepoScan(outcome))

    onRepoChanged(repoPath => {
      if (
        this.state.selectedRepo !== null &&
        this.state.selectedRepo.path === repoPath &&
        this.state.busy === null &&
        !this.state.aiBusy &&
        // While the merge agent holds a file mid-conversation, its
        // half-written content must not repaint the desk underneath it.
        this.state.aiMerge === null
      ) {
        void this.refresh({ silent: true })
      }
    })

    onUpdateState(state => {
      this.applyUpdatePush(state)
    })

    window.addEventListener('focus', () => {
      if (this.state.selectedRepo !== null) void this.refresh({ silent: true })
    })
  }

  private applyTheme(theme: ThemeId): void {
    // Replace any previous listener instead of stacking one per settings save.
    if (this.mediaQuery !== null && this.mediaHandler !== null) {
      this.mediaQuery.removeEventListener('change', this.mediaHandler)
    }
    this.mediaQuery = null
    this.mediaHandler = null

    // Cache the raw setting so main.tsx can re-apply it synchronously
    // before first paint on the next launch — a saved custom palette
    // should never flash through Primer first.
    try {
      window.localStorage.setItem('aspen.theme', theme)
    } catch {
      /* private-mode storage: first-paint cache is best-effort */
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent): void => {
        document.documentElement.setAttribute(
          'data-theme',
          e.matches ? 'dark' : 'light'
        )
        document.documentElement.setAttribute(
          'data-theme-base',
          e.matches ? 'dark' : 'light'
        )
      }
      document.documentElement.setAttribute(
        'data-theme',
        mq.matches ? 'dark' : 'light'
      )
      document.documentElement.setAttribute(
        'data-theme-base',
        mq.matches ? 'dark' : 'light'
      )
      mq.addEventListener('change', handler)
      this.mediaQuery = mq
      this.mediaHandler = handler
    } else {
      // data-theme names the palette block; data-theme-base keeps the
      // inherited Primer block of the same family selected underneath it.
      const base = themeBase(theme, false)
      document.documentElement.setAttribute('data-theme', theme)
      document.documentElement.setAttribute('data-theme-base', base)
    }
  }

  private async handleMenuAction(action: MenuAction): Promise<void> {
    // Menu accelerators bypass the disabled buttons; without this gate a
    // second Ctrl+Enter double-commits and Ctrl+Shift+{P,U} run git
    // concurrently and hit index-lock errors. Read-only refresh is exempt —
    // as are the donate and check-for-updates one-offs, neither of which
    // touches the working tree.
    if (
      action !== 'refresh' &&
      action !== 'donate' &&
      action !== 'check-updates' &&
      action !== 'toggle-terminal' &&
      this.state.busy !== null
    ) {
      this.toast('info', 'Wait for the current operation to finish.')
      return
    }
    switch (action) {
      case 'commit':
        await this.commit()
        break
      case 'stage-all':
        await this.stageAll()
        break
      case 'unstage-all':
        await this.unstageAll()
        break
      case 'refresh':
        await this.refresh()
        break
      case 'fetch':
        await this.doSync('fetch')
        break
      case 'pull':
        await this.doSync('pull')
        break
      case 'push':
        await this.doSync('push')
        break
      case 'new-branch':
        this.update({ showNewBranch: true, newBranchBase: null })
        break
      case 'merge-branch':
        this.update({ mergeBranchOpen: true })
        break
      case 'show-preferences':
        this.update({ showSettings: true })
        break
      case 'add-repository':
        await this.addLocalRepository()
        break
      case 'clone-repository':
        this.setCloneOpen(true)
        break
      case 'manage-repositories':
        this.setRepoManagerOpen(true)
        break
      case 'show-about':
        this.update({ showAbout: true })
        break
      case 'check-updates':
        await this.checkForUpdatesNow()
        break
      case 'toggle-terminal':
        this.toggleTerminal()
        break
      case 'donate':
        void call('openExternal', DONATE_URL)
        break
      case 'stash-all':
        this.stashAllChanges()
        break
      case 'edit-last-commit':
        await this.editLastCommit()
        break
      case 'undo-commit':
        this.undoCommit()
        break
      case 'copy-sha':
        this.copySelectedCommitSha()
        break
      case 'revert-commit':
        this.revertSelectedCommit()
        break
      case 'cherry-pick-commit':
        this.cherryPickSelectedCommit()
        break
      case 'create-branch-from-commit':
        this.createBranchFromSelectedCommit()
        break
      case 'delete-branch':
        this.deleteCurrentBranch()
        break
      case 'rename-branch':
        this.update({ renameBranchTarget: this.state.status?.branch ?? null })
        break
      case 'view-on-github':
        await this.viewOnGitHub({ kind: 'repo' })
        break
    }
  }

  // ------------------------------------------------------------------ repos

  async selectRepo(repo: Repository): Promise<void> {
    localStorage.setItem('aspen.lastRepo', repo.path)
    // Hydrate the persisted draft into visible state so the commit box shows
    // exactly what Enter/Ctrl+Enter would actually commit.
    const drafts = new Map(this.state.drafts)
    drafts.set(repo.path, this.draftFor(repo.path))
    this.update({
      drafts,
      selectedRepo: repo,
      status: null,
      statusError: null,
      selectedFilePath: null,
      selectedFileDiff: null,
      selectedFileError: null,
      selectedFilePreview: null,
      selectedCommit: null,
      commitFiles: [],
      commitFilesError: null,
      selectedCommitFilePath: null,
      selectedCommitFileDiff: null,
      selectedCommitFilePreview: null,
      amend: null,
      lastCommit: null,
      stashes: [],
      aiMerge: null,
      view: 'review',
      deskFilter: '',
      mergeBranchOpen: false,
      showStash: false,
      selectedStashIndex: null,
  scopeAdds: 0,
  scopeDels: 0,
  scopeLoading: false,
      logSearch: '',
      logAuthor: '',
      commits: []
    })
    void call('startWatching', repo.path).catch(() => undefined)
    await Promise.all([
      this.refresh(),
      this.refreshBranches(),
      this.refreshIdentity(),
      this.refreshStashes()
    ])
    try {
      this.update({ remoteUrl: await call('getRemoteUrl', repo.path) })
    } catch {
      this.update({ remoteUrl: null })
    }
  }

  async addLocalRepository(): Promise<void> {
    const dir = await call('selectDirectory')
    if (dir === null) return
    try {
      const repo = await call('addRepository', dir)
      const repositories = await call('listRepositories')
      this.update({ repositories })
      await this.selectRepo(repo)
      this.toast('success', `Added ${repo.name}`)
    } catch (err) {
      this.toast(
        'error',
        `${err instanceof Error ? err.message : String(err)}\n(Is the folder a git repository?)`
      )
    }
  }

  /** Bulk add from the repository manager's native multi-select picker. */
  async addRepositoriesBulk(): Promise<void> {
    const dirs = await call('selectDirectories')
    if (dirs === null) return
    try {
      const result = await call('addRepositories', dirs)
      this.update({ repositories: await call('listRepositories') })
      const parts: string[] = []
      if (result.added.length > 0) parts.push(`Added ${result.added.length}`)
      if (result.skipped.length > 0)
        parts.push(`${result.skipped.length} already in the list`)
      this.toast(
        result.added.length > 0 || result.skipped.length > 0
          ? 'success'
          : 'error',
        parts.length > 0 ? `${parts.join(' · ')}.` : 'Nothing was added.'
      )
      for (const f of result.failed) {
        const name = f.path.split(/[\\/]/).filter(p => p.length > 0).pop() ?? f.path
        this.toast('error', `Could not add "${name}" — ${f.error}`)
      }
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Bulk remove shared by the manager and the header popover's single-remove.
   * `deleteFromDisk` moves whole folders to the Recycle Bin after an explicit
   * warning.
   */
  removeRepositories(ids: ReadonlyArray<string>, deleteFromDisk: boolean): void {
    const targets = this.state.repositories.filter(r => ids.includes(r.id))
    if (targets.length === 0) return
    const list = targets
      .slice(0, 5)
      .map(r => r.name)
      .join(', ')
    const more =
      targets.length > 5 ? `, and ${targets.length - 5} more` : ''
    const single = targets.length === 1 ? targets[0].name : null

    const onConfirm = (): void => {
      this.update({ confirm: null })
      void this.runRemoveRepositories(ids, deleteFromDisk)
    }

    this.update({
      confirm: deleteFromDisk
        ? {
            title: 'Move folders to the Recycle Bin?',
            message:
              `${targets.length === 1 ? `The folder for "${single}"` : `${targets.length} repository folders`} ` +
              'will be moved to the Recycle Bin — entire folders, including working files, ' +
              'uncommitted changes and git history. You can restore them from the Bin.\n\n' +
              `${list}${more}`,
            confirmLabel: 'Move to Recycle Bin',
            onConfirm
          }
        : {
            title:
              targets.length === 1 ? 'Remove repository' : 'Remove repositories',
            message: single !== null
              ? `"${single}" will be removed from Aspen. The folder and its git data stay on disk.`
              : `These repositories (${list}${more}) will be removed from Aspen. The folders and their git data stay on disk.`,
            confirmLabel: 'Remove',
            onConfirm
          }
    })
  }

  private async runRemoveRepositories(
    ids: ReadonlyArray<string>,
    deleteFromDisk: boolean
  ): Promise<void> {
    try {
      const result = await call('removeRepositories', ids, deleteFromDisk)
      const repositories = await call('listRepositories')
      const patch: Partial<AppState> = { repositories }
      const selected = this.state.selectedRepo
      if (selected !== null && ids.includes(selected.id)) {
        Object.assign(patch, {
          selectedRepo: null,
          status: null,
          statusError: null,
          commits: [],
          branches: [],
          remoteBranches: []
        })
        localStorage.removeItem('aspen.lastRepo')
      }
      this.update(patch)
      const head = deleteFromDisk
        ? `Moved ${result.removed} to the Recycle Bin`
        : `Removed ${result.removed}`
      if (result.trashFailed.length > 0) {
        const detail = result.trashFailed
          .map(
            f =>
              `${f.path.split(/[\\/]/).filter(p => p.length > 0).pop() ?? f.path} (${f.error})`
          )
          .join('; ')
        this.toast('error', `${head} — could not move to the Bin: ${detail}`)
      } else {
        this.toast('success', `${head}.`)
      }
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  /** Header popover's "Remove this repository" — list-only removal. */
  removeRepository(): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.removeRepositories([repo.id], false)
  }

  // ------------------------------------------------ watch-folder scanning

  /**
   * In-flight store-initiated scans; the REPOS_CHANGED push they trigger
   * still refreshes the list, but the calling action owns the toast so the
   * same folders are never announced twice.
   */
  private quietRepoPushes = 0

  private applyRepoScan(outcome: RepoScanOutcome): void {
    // Captured synchronously: the refresh below crosses an IPC boundary, by
    // which time a store-initiated scan has long since decremented the
    // counter and toasted its own summary.
    const quiet = this.quietRepoPushes > 0
    void (async (): Promise<void> => {
      try {
        const repositories = await call('listRepositories')
        const patch: Partial<AppState> = { repositories }
        const selected = this.state.selectedRepo
        if (
          selected !== null &&
          outcome.removed.some(r => r.id === selected.id)
        ) {
          Object.assign(patch, {
            selectedRepo: null,
            status: null,
            statusError: null,
            commits: [],
            branches: [],
            remoteBranches: []
          })
          localStorage.removeItem('aspen.lastRepo')
        }
        this.update(patch)
        if (quiet) return
        const names = (
          repos: ReadonlyArray<Repository>
        ): string =>
          repos
            .slice(0, 3)
            .map(r => r.name)
            .join(', ') +
          (repos.length > 3 ? ` and ${repos.length - 3} more` : '')
        const parts: string[] = []
        if (outcome.added.length > 0)
          parts.push(`added ${names(outcome.added)}`)
        if (outcome.removed.length > 0)
          parts.push(`removed ${names(outcome.removed)}`)
        if (parts.length > 0)
          this.toast('info', `Watch folder — ${parts.join(' and ')}.`)
      } catch {
        // A failed refresh retries on the next push or app focus.
      }
    })()
  }

  /** Pick (or change) the folder the repository list follows. */
  async chooseScanFolder(): Promise<void> {
    const dir = await call('selectDirectory')
    if (dir === null) return
    this.quietRepoPushes++
    try {
      const settings = await call('saveSettings', { scanFolder: dir })
      const outcome = await call('scanRepositories')
      this.update({
        settings,
        repositories: await call('listRepositories')
      })
      const leaf = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? dir
      this.toast(
        'success',
        outcome.added.length > 0
          ? `Now watching "${leaf}" — added ${outcome.added.length} repository${outcome.added.length === 1 ? '' : 's'}.`
          : `Now watching "${leaf}" for added and removed repositories.`
      )
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    } finally {
      this.quietRepoPushes--
    }
  }

  async clearScanFolder(): Promise<void> {
    try {
      const settings = await call('saveSettings', { scanFolder: '' })
      this.update({ settings })
      this.toast('info', 'Stopped watching the repository folder.')
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  /** Reconcile now — the manager's Rescan button. */
  async rescanWatchFolder(): Promise<void> {
    this.quietRepoPushes++
    try {
      const outcome = await call('scanRepositories')
      this.update({ repositories: await call('listRepositories') })
      if (outcome.added.length === 0 && outcome.removed.length === 0) {
        this.toast('info', 'No changes — the list matches the folder.')
      }
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    } finally {
      this.quietRepoPushes--
    }
  }

  /** Fetch several repositories in a row; reports a per-repo tally. */
  async fetchRepos(
    paths: ReadonlyArray<string>
  ): Promise<{ ok: number; failures: string[] }> {
    let ok = 0
    const failures: string[] = []
    for (const p of paths) {
      const name = p.split(/[\\/]/).filter(x => x.length > 0).pop() ?? p
      try {
        await call('fetch', p)
        ok++
      } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (failures.length === 0) {
      this.toast('success', `Fetched ${ok} of ${paths.length}.`)
    } else {
      this.toast(
        'error',
        `Fetched ${ok} of ${paths.length} — ${failures.join('; ').slice(0, 300)}`
      )
    }
    return { ok, failures }
  }

  async copyPaths(paths: ReadonlyArray<string>): Promise<void> {
    try {
      await call('writeClipboard', paths.join('\n'))
      this.toast(
        'info',
        `Copied ${paths.length} folder path${paths.length === 1 ? '' : 's'} to clipboard.`
      )
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  async clone(url: string, baseDir: string, folderName: string): Promise<void> {
    const dest = `${baseDir.replace(/[\\/]+$/, '')}/${folderName}`
    this.update({ busy: 'clone' })
    try {
      const output = await call('cloneRepository', url, dest)
      const repositories = await call('listRepositories')
      this.update({ repositories, busy: null, showClone: false })
      const added = repositories.find(r => r.path.replace(/\\/g, '/') === dest)
      if (added !== undefined) await this.selectRepo(added)
      const tail = output.split('\n').filter(l => l.trim().length > 0).slice(-2).join(' ')
      this.toast('success', `Cloned.${tail.length > 0 ? ` ${tail}` : ''}`)
    } catch (err) {
      this.update({ busy: null })
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  // ------------------------------------------------------ hosted accounts

  private signInTimer: ReturnType<typeof setTimeout> | null = null

  async refreshAccounts(): Promise<void> {
    try {
      this.update({ accounts: await call('listAccounts') })
      void this.loadAvatars()
    } catch {
      /* Account lists are best-effort; the next dialog open retries. */
    }
  }

  /**
   * Boot-time re-validation of every stored account (main owns the logic):
   * updated names/avatars land in the list, and an account whose token was
   * revoked signs itself out with a toast explaining why.
   */
  async syncAccounts(): Promise<void> {
    try {
      const report = await call('syncAccounts')
      this.update({ accounts: report.accounts })
      for (const gone of report.signedOut) {
        this.toast(
          'info',
          `Signed out of ${gone.login} — ${gone.provider === 'github' ? 'GitHub' : 'GitLab'} no longer accepts the stored token.`
        )
      }
      if (report.signedOut.length > 0) void this.loadAvatars()
    } catch {
      /* Offline at boot: the identities simply stay as last seen. */
    }
  }

  /** Fetch any account avatars this renderer pass has not seen yet. */
  private async loadAvatars(): Promise<void> {
    for (const account of this.state.accounts) {
      if (account.avatarUrl === null) continue
      if (account.id in this.state.avatars) continue
      void call('accountAvatar', account.id)
        .then(url => {
          this.update({ avatars: { ...this.state.avatars, [account.id]: url } })
        })
        .catch(() => {
          this.update({ avatars: { ...this.state.avatars, [account.id]: null } })
        })
    }
  }

  /**
   * Token sign-in (works for every provider and every instance). Returns an
   * inline-friendly outcome — the panel renders it next to the token field.
   */
  async signInWithToken(
    provider: AccountProvider,
    token: string,
    apiBase?: string
  ): Promise<{ ok: boolean; message: string; account: AccountInfo | null }> {
    try {
      const account = await call(
        'signInWithToken',
        provider,
        token,
        apiBase !== undefined && apiBase.trim().length > 0 ? apiBase.trim() : undefined
      )
      await this.refreshAccounts()
      this.update({ signIn: null, signInError: null })
      return { ok: true, message: `Signed in as ${account.login}.`, account }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.update({ signInError: message })
      return { ok: false, message, account: null }
    }
  }

  /**
   * Browser sign-in: GitHub authorization-code + PKCE (falling back to the
   * device-code flow when the loopback port is busy, or when `prefer` says
   * 'device'), GitLab OAuth PKCE. The main process owns the token exchange;
   * this loop only asks "is it done" at the provider's own cadence, so
   * closing the dialog never strands the sign-in — it completes on the next
   * poll wherever the UI happens to be.
   */
  async startBrowserSignIn(
    provider: AccountProvider,
    apiBase?: string,
    prefer?: 'web' | 'device'
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const challenge = await call(
        'beginSignIn',
        provider,
        apiBase !== undefined && apiBase.trim().length > 0 ? apiBase.trim() : undefined,
        prefer
      )
      this.update({ signIn: challenge, signInError: null })
      const openUrl =
        challenge.kind === 'github-device'
          ? challenge.verificationUrl
          : challenge.authorizeUrl
      try {
        await call('openExternal', openUrl)
      } catch {
        /* The panel always offers the link again manually. */
      }
      this.scheduleSignInPoll(challenge)
      return { ok: true, message: '' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.update({ signIn: null, signInError: message })
      return { ok: false, message }
    }
  }

  private scheduleSignInPoll(challenge: SignInChallenge): void {
    this.stopSignInPoll()
    const every =
      challenge.kind === 'github-device'
        ? Math.max(1_000, challenge.intervalMs)
        : 1_000
    const tick = async (): Promise<void> => {
      try {
        const status = await call('pollSignIn', challenge.requestId)
        if (status.status === 'pending') {
          this.signInTimer = setTimeout(() => void tick(), every)
          return
        }
        this.stopSignInPoll()
        if (status.status === 'signed-in') {
          this.update({ signIn: null, signInError: null })
          await this.refreshAccounts()
          this.toast('success', `Signed in to ${status.account.login}.`)
        } else {
          this.update({ signIn: null, signInError: status.message })
        }
      } catch (err) {
        this.stopSignInPoll()
        this.update({
          signIn: null,
          signInError: err instanceof Error ? err.message : String(err)
        })
      }
    }
    this.signInTimer = setTimeout(() => void tick(), every)
  }

  private stopSignInPoll(): void {
    if (this.signInTimer !== null) clearTimeout(this.signInTimer)
    this.signInTimer = null
  }

  cancelBrowserSignIn(): void {
    const challenge = this.state.signIn
    this.stopSignInPoll()
    this.update({ signIn: null, signInError: null })
    if (challenge !== null) void call('cancelSignIn', challenge.requestId).catch(() => undefined)
  }

  async signOut(accountId: string): Promise<void> {
    try {
      await call('removeAccount', accountId)
      const avatars = { ...this.state.avatars }
      delete avatars[accountId]
      this.update({ avatars })
      await this.refreshAccounts()
      this.toast('info', 'Signed out — the stored token was deleted.')
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * One page of an account's hosted repositories. A non-empty `search` is
   * applied provider-side (GitHub Search API / GitLab `?search=`); the pane
   * re-filters loaded items client-side too.
   */
  async listRemoteRepos(
    accountId: string,
    search: string,
    cursor: string | null,
    sort?: RemoteRepoSort
  ): Promise<RemoteRepoPage> {
    return call('listRemoteRepositories', accountId, { search, cursor, perPage: 50, sort })
  }

  // ---------------------------------------------------------------- refresh

  async refresh(options?: { silent?: boolean }): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return

    // Coalesce bursts (a watcher firing per keystroke-save) into one re-read.
    if (this.refreshing) {
      this.pendingRefresh = true
      return
    }
    this.refreshing = true
    try {
      do {
        this.pendingRefresh = false
        try {
          const prevConflicts = this.state.status?.conflictCount ?? 0
          const status = await call('getStatus', repo.path)
          // Repo may have changed under an in-flight fetch; drop the result
          // instead of painting repo A's status over repo B.
          if (this.state.selectedRepo?.path !== repo.path) return
          const draft = this.draftFor(repo.path)
          const valid = new Set(status.files.map(f => f.path))
          // While amending, `checked` holds the tip commit's paths, which are
          // identical to HEAD and therefore absent from status.files — pruning
          // them here silently guts the amend scope. Skip pruning then.
          const validCheck = this.state.amend !== null ? draft.checked : valid
          const checked = new Set([...draft.checked].filter(p => validCheck.has(p)))
          this.update({
            status,
            statusError: null,
            lastRefreshedAt: Date.now(),
            initError: null
          })
          // A pull or edit that newly produces conflicts interrupts the
          // review flow — the one state allowed to move the visitor.
          if (
            status.conflictCount > 0 &&
            prevConflicts === 0 &&
            this.state.view === 'review'
          ) {
            // The desk moves on its own: the incoming queue and pane fade in,
            // and nothing that did not change is asked to move.
            this.update({ view: 'conflicts' })
          }
          if (checked.size !== draft.checked.size) {
            this.setDraft(repo.path, { checked })
          }
          if (this.state.selectedFilePath !== null && !valid.has(this.state.selectedFilePath)) {
            this.update({
              selectedFilePath: null,
              selectedFileDiff: null,
              selectedFileError: null,
              selectedFilePreview: null
            })
          }
          if (this.state.view === 'history') await this.loadLog(false)
        } catch (err) {
          this.update({
            status: null,
            statusError: options?.silent === true ? this.state.statusError : err instanceof Error ? err.message : String(err)
          })
        }
      } while (this.pendingRefresh && this.state.selectedRepo === repo)
    } finally {
      this.refreshing = false
    }
  }

  async refreshBranches(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      const list = await call('getBranches', repo.path)
      if (this.state.selectedRepo?.path !== repo.path) return
      this.update({
        branches: list.local,
        remoteBranches: list.remote,
        branchesError: null
      })
    } catch (err) {
      this.update({
        branches: [],
        remoteBranches: [],
        branchesError: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async refreshStashes(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      const stashes = await call('listStashes', repo.path)
      if (this.state.selectedRepo?.path !== repo.path) return
      const sel = this.state.selectedStashIndex
      this.update({
        stashes,
        selectedStashIndex:
          sel !== null && stashes.some(s => s.index === sel)
            ? sel
            : stashes[0]?.index ?? null
      })
    } catch {
      this.update({ stashes: [], selectedStashIndex: null })
    }
  }

  async refreshIdentity(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      const identity = await call('getConfigInfo', repo.path)
      if (this.state.selectedRepo?.path !== repo.path) return
      this.update({ identity })
    } catch {
      this.update({ identity: null })
    }
  }

  /** Loads one page of history into state (used by refresh and paging). */
  private async loadLog(append: boolean): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const skip = append ? this.state.commits.length : 0
    this.update({ commitsLoading: true, logError: null })
    try {
      const page = await call('getLog', repo.path, {
        maxCount: PAGE_SIZE,
        skip,
        search: this.state.logSearch,
        author: this.state.logAuthor
      })
      if (this.state.selectedRepo?.path !== repo.path) return
      this.update({
        commits: append ? [...this.state.commits, ...page] : page,
        logExhausted: page.length < PAGE_SIZE,
        commitsLoading: false
      })
    } catch (err) {
      this.update({
        commitsLoading: false,
        commits: append ? this.state.commits : [],
        logError: err instanceof Error ? err.message : String(err)
      })
    }
  }

  setLogSearch(value: string): void {
    this.update({ logSearch: value })
    this.scheduleLogReload()
  }

  setLogAuthor(value: string): void {
    this.update({ logAuthor: value })
    this.scheduleLogReload()
  }

  private scheduleLogReload(): void {
    if (this.logDebounce !== null) clearTimeout(this.logDebounce)
    this.logDebounce = setTimeout(() => {
      this.logDebounce = null
      void this.loadLog(false)
    }, 250)
  }

  async loadMoreCommits(): Promise<void> {
    if (this.state.commitsLoading || this.state.logExhausted) return
    await this.loadLog(true)
  }

  async refreshLog(): Promise<void> {
    await this.loadLog(false)
  }

  setView(view: DeskView): void {
    const syncLog = this.state.logSearch !== this.state.deskFilter
    this.update({ view })
    if (view === 'history') {
      if (syncLog) this.update({ logSearch: this.state.deskFilter })
      if (syncLog || (this.state.commits.length === 0 && !this.state.commitsLoading)) {
        this.scheduleLogReload()
      }
    }
    if (view === 'conflicts') {
      const first = this.state.status?.files.find(f => f.kind === 'conflicted')
      if (first !== undefined && this.state.selectedFilePath === null) {
        void this.selectFile(first.path)
      }
    }
  }

  /** The command strip's filter: scopes files, commits, or stashes. */
  setDeskFilter(value: string): void {
    this.update({ deskFilter: value })
    if (this.state.view === 'history' && value !== this.state.logSearch) {
      this.update({ logSearch: value })
      this.scheduleLogReload()
    }
  }

  selectStash(index: number | null): void {
    this.update({ selectedStashIndex: index })
  }

  // ----------------------------------------------------------------- files

  private fileByPath(path: string): FileStatus | undefined {
    return this.state.status?.files.find(f => f.path === path)
  }

  async selectFile(path: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({
      selectedFilePath: path,
      selectedFileDiff: '…',
      selectedFileError: null,
      selectedFilePreview: null
    })
    const entry = this.fileByPath(path)
    // A conflicted media file holds conflict markers on disk — playing that
    // would be nonsense, so the binary-diff panel stays there.
    const preview: Promise<FilePreview | null> =
      entry?.kind === 'conflicted'
        ? Promise.resolve(null)
        : call('getPreview', repo.path, path).catch(() => null)
    try {
      const diff = await call(
        'getPathDiff',
        repo.path,
        path,
        entry?.oldPath ?? undefined
      )
      if (this.state.selectedFilePath === path) {
        this.update({ selectedFileDiff: diff, selectedFileError: null })
      }
    } catch (err) {
      if (this.state.selectedFilePath === path) {
        this.update({
          selectedFileDiff: null,
          selectedFileError: err instanceof Error ? err.message : String(err)
        })
      }
    }
    const previewResult = await preview
    if (this.state.selectedFilePath === path) {
      this.update({ selectedFilePreview: previewResult })
    }
  }

  toggleCheck(path: string): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const draft = this.draftFor(repo.path)
    const checked = new Set(draft.checked)
    if (checked.has(path)) checked.delete(path)
    else checked.add(path)
    this.setDraft(repo.path, { checked })
    void this.selectFile(path)
  }

  setAllChecked(checked: boolean): void {
    const repo = this.state.selectedRepo
    if (repo === null || this.state.status === null) return
    this.setDraft(repo.path, {
      checked: checked ? new Set(this.state.status.files.map(f => f.path)) : new Set()
    })
  }

  private scopeToken = 0

  /**
   * Refreshes the tray's scope stats: the added/removed line totals across
   * exactly the commit scope (staged baseline ∪ ticked paths), so "what
   * will ship" is honest before commit.
   */
  async recomputeScope(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const draft = this.state.drafts.get(repo.path)
    const checked = draft?.checked ?? new Set<string>()
    // The scope line must match what Commit ships: staged baseline ∪ ticked.
    const stagedScope = new Set(
      (this.state.status?.files ?? []).filter(f => f.staged).map(f => f.path)
    )
    const scopeSet = new Set([...checked, ...stagedScope])
    if (scopeSet.size === 0) {
      this.update({ scopeAdds: 0, scopeDels: 0, scopeLoading: false })
      return
    }
    const token = ++this.scopeToken
    this.update({ scopeLoading: true })
    const paths = [...scopeSet].slice(0, 40)
    try {
      const diffs = await Promise.all(
        paths.map(p =>
          call('getPathDiff', repo.path, p, this.fileByPath(p)?.oldPath ?? undefined)
        )
      )
      if (token !== this.scopeToken) return
      let adds = 0
      let dels = 0
      for (const d of diffs) {
        for (const line of d.split('\n')) {
          if (line.startsWith('+') && !line.startsWith('+++')) adds += 1
          else if (line.startsWith('-') && !line.startsWith('---')) dels += 1
        }
      }
      this.update({ scopeAdds: adds, scopeDels: dels, scopeLoading: false })
    } catch {
      if (token === this.scopeToken) this.update({ scopeLoading: false })
    }
  }

  async stageAll(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null || this.state.status === null) return
    await this.runGit(async () => {
      await call('stagePaths', repo.path, this.state.status!.files.map(f => f.path))
    }, 'stage')
  }

  async unstageAll(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null || this.state.status === null) return
    await this.runGit(async () => {
      await call(
        'unstagePaths',
        repo.path,
        this.state.status!.files.map(f => f.path)
      )
    }, 'unstage')
  }

  toggleStaged(path: string): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const entry = this.fileByPath(path)
    if (entry === undefined) return
    void this.runGit(async () => {
      if (entry.staged) {
        await call('unstagePaths', repo.path, [path])
      } else {
        await call('stagePaths', repo.path, [path])
      }
    }, 'stage')
  }

  discardFile(path: string): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({
      confirm: {
        title: 'Discard changes',
        message: `Discard changes in "${path}"? This cannot be undone.`,
        confirmLabel: 'Discard',
        tone: 'danger',
        onConfirm: () => {
          this.update({ confirm: null })
          void this.discardPaths([path])
        }
      }
    })
  }

  discardAllChanges(): void {
    const repo = this.state.selectedRepo
    const files = this.state.status?.files ?? []
    if (repo === null || files.length === 0) return
    this.update({
      confirm: {
        title: 'Discard all changes',
        message: `Discard changes in all ${files.length} file${files.length === 1 ? '' : 's'}? This cannot be undone.`,
        confirmLabel: 'Discard all',
        tone: 'danger',
        onConfirm: () => {
          this.update({ confirm: null })
          void this.discardPaths(files.map(f => f.path))
        }
      }
    })
  }

  private async discardPaths(paths: ReadonlyArray<string>): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const entries = paths
      .map(p => this.fileByPath(p))
      .filter((e): e is FileStatus => e !== undefined)
    const expanded = new Set<string>(paths)
    for (const e of entries) {
      if (e.oldPath !== undefined) expanded.add(e.oldPath)
    }
    await this.runGit(async () => {
      await call('discardPaths', repo.path, [...expanded])
    }, 'discard')
    const selected = this.state.selectedFilePath
    if (selected !== null && expanded.has(selected)) {
      this.update({
        selectedFilePath: null,
        selectedFileDiff: null,
        selectedFileError: null,
        selectedFilePreview: null
      })
    }
  }

  /** One-click resolution of a conflicted file. */
  resolveConflict(
    path: string,
    side: 'ours' | 'theirs' | 'resolved'
  ): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    void this.runGit(async () => {
      await call('resolveConflict', repo.path, path, side)
    }, 'resolve')
  }

  // ------------------------------------------------------------ AI merge agent

  /** Ask the agent to merge one conflicted file; it asks back if unsure. */
  startAiMerge(path: string): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    // Same progressive rule as ✨ Generate: an obviously unconfigured agent
    // goes to Preferences instead of firing a doomed request.
    if (aiLooksUnconfigured(this.state.settings)) {
      this.update({ showSettings: true, settingsAiNote: true })
      return
    }
    this.aiMergeSeq++
    this.update({
      aiMerge: { path, busy: true, questions: null, exchanges: [], error: null }
    })
    void this.runAiMerge(this.aiMergeSeq, path, [])
  }

  /** Answer the agent's open questions and let it finish the merge. */
  submitAiMerge(answers: ReadonlyArray<MergeAnswer>): void {
    const current = this.state.aiMerge
    const repo = this.state.selectedRepo
    if (current === null || repo === null || current.questions === null) return
    const exchanges: MergeExchange[] = [
      ...current.exchanges,
      { questions: current.questions, answers }
    ]
    this.aiMergeSeq++
    this.update({
      aiMerge: {
        ...current,
        busy: true,
        questions: current.questions,
        exchanges,
        error: null
      }
    })
    void this.runAiMerge(this.aiMergeSeq, current.path, exchanges)
  }

  /** Re-run the current turn after an error; answers already sent are kept. */
  retryAiMerge(): void {
    const current = this.state.aiMerge
    const repo = this.state.selectedRepo
    if (current === null || repo === null || current.busy) return
    this.aiMergeSeq++
    this.update({ aiMerge: { ...current, busy: true, error: null } })
    void this.runAiMerge(this.aiMergeSeq, current.path, current.exchanges)
  }

  /** Leave the conversation; an in-flight turn is aborted first. */
  closeAiMerge(): void {
    const current = this.state.aiMerge
    const repo = this.state.selectedRepo
    this.aiMergeSeq++
    if (current !== null && repo !== null && current.busy) {
      void call('cancelAiResolve', repo.path, current.path).catch(
        () => undefined
      )
    }
    this.update({ aiMerge: null })
  }

  private aiMergeSeq = 0

  private async runAiMerge(
    seq: number,
    path: string,
    exchanges: ReadonlyArray<MergeExchange>
  ): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    // A stale turn must not repaint a conversation the user replaced or left.
    const mine = (): boolean => this.aiMergeSeq === seq
    try {
      const outcome = await call('aiResolveConflict', repo.path, path, exchanges)
      if (!mine()) return
      if (outcome.kind === 'ask') {
        this.update({
          aiMerge: { path, busy: false, questions: outcome.questions, exchanges, error: null }
        })
        return
      }
      this.update({ aiMerge: null })
      await this.refresh()
      if (this.state.selectedFilePath === path) void this.selectFile(path)
      const note =
        outcome.summary.length > 160
          ? outcome.summary.slice(0, 157) + '…'
          : outcome.summary
      this.toast('success', `AI merged ${path} — ${note}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'cancelled' || !mine()) return
      const current = this.state.aiMerge
      if (current !== null && current.path === path) {
        this.update({ aiMerge: { ...current, busy: false, error: message } })
      } else {
        this.toast('error', message)
      }
    }
  }

  continueWorkflow(kind: WorkflowKind): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    void this.runGit(async () => {
      await call('continueOperation', repo.path, kind)
    }, 'continue').then(() => void this.refreshStashes())
  }

  abortWorkflow(kind: WorkflowKind): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({
      confirm: {
        title: 'Abort this operation',
        message:
          kind === 'merge'
            ? 'Abort the merge? Your working tree returns to the state before the merge started.'
            : kind === 'rebase'
              ? 'Abort the rebase? The branch returns to where it was before the rebase.'
              : 'Abort the operation and restore the working tree?',
        confirmLabel: 'Abort',
        tone: 'danger',
        onConfirm: () => {
          this.update({ confirm: null })
          void this.runGit(async () => {
            await call('abortOperation', repo.path, kind)
          }, 'abort')
        }
      }
    })
  }

  // ------------------------------------------------------- shell integration

  async revealFile(path: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    await this.guarded(() => call('revealInFolder', repo.path, path), 'reveal')
  }

  /**
   * Re-run the main-side detection for the "Open in" menu. Deliberately not
   * `guarded`: a fast probe must not flip `busy` and grey out the strip —
   * the menu keeps showing the previous list until fresh results arrive.
   */
  async refreshExternalApps(force = false): Promise<void> {
    if (!force && this.state.externalApps.length > 0) return
    try {
      const apps = await call('listExternalApps', force)
      this.update({ externalApps: apps })
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  async openInApp(appId: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    await this.guarded(
      () => call('openInExternalApp', repo.path, appId),
      'open-in'
    )
  }

  /**
   * Dock or undock the integrated terminal panel (⋯ menu, View menu,
   * Ctrl+`). The session itself is the panel component's business: it
   * spawns on mount and kills on unmount, so closing here is what tears
   * the PTY down. Closing also asks for a silent refresh — a shell that
   * just ran `npm test` or edited files must not leave a stale desk.
   */
  toggleTerminal(): void {
    if (this.state.selectedRepo === null) return
    const next = !this.state.terminalOpen
    writeTerminalOpen(next)
    this.update({ terminalOpen: next })
    if (!next) void this.refresh({ silent: true })
  }

  async openFile(path: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    await this.guarded(() => call('openFile', repo.path, path), 'open')
  }

  async copyText(text: string, label?: string): Promise<void> {
    await this.guarded(
      async () => {
        await call('writeClipboard', text)
      },
      'copy'
    )
    this.toast('info', `${label ?? 'Copied'} to clipboard.`)
  }

  async ignoreFile(path: string, request: IgnoreRequest): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const outcome: { value: GitignoreResult | null } = { value: null }
    await this.guarded(async () => {
      outcome.value = await call('addToGitignore', repo.path, path, request)
    }, 'ignore')
    const result = outcome.value
    if (result !== null) {
      if (result.appended.length === 0) {
        this.toast('info', 'Already in .gitignore.')
      } else {
        const tracked =
          result.trackedInScope > 0
            ? ` ${result.trackedInScope} tracked file${
                result.trackedInScope === 1 ? '' : 's'
              } in scope stay${result.trackedInScope === 1 ? 's' : ''} tracked.`
            : ''
        this.toast(
          'info',
          `Added ${result.appended.length} ignore rule${
            result.appended.length === 1 ? '' : 's'
          } to .gitignore.${tracked}`
        )
      }
    }
    await this.refresh()
  }

  async viewOnGitHub(target: GitHubTarget): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    await this.guarded(() => call('viewOnGitHub', repo.path, target), 'open')
  }

  async addRemote(url: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    await this.guarded(async () => {
      await call('addRemote', repo.path, url)
      this.update({ remoteUrl: url.trim() })
    }, 'remote')
  }

  private async guarded(
    fn: () => Promise<void>,
    busyKey: string
  ): Promise<void> {
    this.update({ busy: busyKey })
    try {
      await fn()
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    } finally {
      this.update({ busy: null })
    }
  }

  // ---------------------------------------------------------------- commit

  setSummary(value: string): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.setDraft(repo.path, { summary: value })
  }

  setDescription(value: string): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.setDraft(repo.path, { description: value })
  }

  async commit(): Promise<void> {
    const repo = this.state.selectedRepo
    const status = this.state.status
    if (repo === null || status === null) return
    const draft = this.draftFor(repo.path)

    if (draft.summary.trim().length === 0) {
      this.toast('error', 'Enter a commit summary first.')
      return
    }
    // Staged files are the commit baseline; ticking only adds to it.
    const staged = status.files.filter(f => f.staged).map(f => f.path)
    const selected = [...draft.checked]
    if (selected.length === 0 && staged.length === 0 && this.state.amend === null) {
      this.toast('error', 'Nothing to commit — stage some files or tick at least one.')
      return
    }
    if (this.identityMissing()) {
      this.toast(
        'error',
        'Set your git author name and email in the changes panel before committing.'
      )
      return
    }

    this.update({ busy: 'commit' })
    const summary = draft.summary.trim()
    try {
      const sha =
        this.state.amend === null
          ? await call(
              'commitPaths',
              repo.path,
              summary,
              draft.description,
              selected,
              staged
            )
          : await call(
              'amendCommit',
              repo.path,
              summary,
              draft.description,
              selected,
              this.state.amend?.sha ?? ''
            )

      this.setDraft(repo.path, {
        summary: '',
        description: '',
        checked: new Set()
      })
      const wasAmend = this.state.amend !== null
      this.update({
        busy: null,
        amend: null,
        lastCommit: {
          sha,
          summary,
          description: draft.description,
          // Undo re-checks the whole shipped scope: after the soft reset
          // those paths are all staged again, so the ticks just mirror the
          // baseline they will commit on the next press.
          paths: wasAmend ? selected : [...new Set([...staged, ...selected])]
        }
      })
      this.toast(
        'success',
        `${wasAmend ? 'Amended' : 'Committed'} ${sha.slice(0, 7)} — ${summary.slice(0, 60)}`,
        wasAmend
          ? undefined
          : [{ label: 'Undo', onClick: () => this.undoCommit() }]
      )
      this.celebrate('commit')
      await this.refresh()
      void this.refreshBranches()
      void this.refreshStashes()
      if (this.state.view === 'history') void this.loadLog(false)
    } catch (err) {
      this.update({ busy: null })
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  private identityMissing(): boolean {
    const identity = this.state.identity
    return (
      identity !== null &&
      (identity.name === null || identity.email === null)
    )
  }

  /** Loads the latest commit into the commit box for rewriting. */
  async editLastCommit(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      const [latest] = await call('getLog', repo.path, { maxCount: 1 })
      if (latest === undefined) {
        this.toast('error', 'This repository has no commits yet.')
        return
      }
      const files = await call('getCommitFiles', repo.path, latest.sha)
      this.update({
        view: 'review',
        amend: { sha: latest.sha, summary: latest.summary, description: latest.body },
        busy: null
      })
      this.setDraft(repo.path, {
        summary: latest.summary,
        description: latest.body,
        checked: new Set(files.map(f => f.path))
      })
      this.toast('info', `Editing ${latest.sha.slice(0, 7)} — press Commit to replace it.`)
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  cancelAmend(): void {
    this.update({ amend: null })
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.setDraft(repo.path, { summary: '', description: '', checked: new Set() })
  }

  undoCommit(): void {
    const last = this.state.lastCommit
    if (last !== null) {
      this.confirmUncommit(last.sha, last.summary, last.description, last.paths)
      return
    }
    // No just-created Aspen commit: Undo still works as a generic
    // "uncommit the tip" over whatever the history shows first. The
    // expected-sha guard in main rejects a stale listing before touching
    // history, so a moved tip just surfaces as its own refusal.
    const tip = this.state.commits[0]
    if (tip === undefined) {
      this.toast('error', 'There is no commit to undo.')
      return
    }
    if (tip.isMerge) {
      this.toast(
        'error',
        'The latest commit is a merge — revert it instead of undoing it.'
      )
      return
    }
    this.confirmUncommit(tip.sha, tip.summary, tip.body, null)
  }

  /**
   * Uncommits the selected commit — the history view's counterpart to
   * Revert: the commit leaves the branch and its changes land in the commit
   * box, instead of a new inverse commit being added.
   */
  uncommitSelectedCommit(): void {
    const commit = this.state.selectedCommit
    if (this.state.selectedRepo === null || commit === null) {
      this.toast('error', 'Select a commit first.')
      return
    }
    if (this.state.commits[0]?.sha !== commit.sha) {
      this.toast(
        'error',
        'Only the latest commit can be uncommitted — older commits need Revert or a rebase.'
      )
      return
    }
    if (commit.isMerge) {
      this.toast(
        'error',
        'This is a merge commit; uncommitting it would flatten the merge. Revert it instead.'
      )
      return
    }
    this.confirmUncommit(commit.sha, commit.summary, commit.body, null)
  }

  /**
   * Shared confirm → guarded soft-reset → refill-the-commit-box flow behind
   * Undo and Uncommit. `paths` rides along when Aspen just produced the
   * commit (the toast's Undo); otherwise the scope is read from the commit
   * itself when the dialog is confirmed.
   */
  private confirmUncommit(
    sha: string,
    summary: string,
    description: string,
    paths: ReadonlyArray<string> | null
  ): void {
    const repo = this.state.selectedRepo
    if (repo === null) {
      this.toast('error', 'Open a repository first.')
      return
    }
    const status = this.state.status
    const pushed =
      status !== null && status.upstream !== undefined && status.ahead === 0
    this.update({
      confirm: {
        title: 'Uncommit this commit?',
        message:
          `"${summary.slice(0, 70)}" will be removed from history. Its changes stay staged and its message goes back to the commit box` +
          (pushed
            ? ' — it was already pushed, so your next push will need a force-push.'
            : '.'),
        confirmLabel: 'Uncommit',
        onConfirm: () => {
          this.update({ confirm: null })
          void (async () => {
            let scope = paths
            if (scope === null) {
              try {
                const files = await call('getCommitFiles', repo.path, sha)
                scope = files.map(f => f.path)
              } catch (err) {
                this.toast(
                  'error',
                  err instanceof Error ? err.message : String(err)
                )
                return
              }
            }
            // runGit reports failure via its boolean, not a rejection: on a
            // refused uncommit (tip moved, repo moved on) the user's current
            // draft must survive untouched and the Undo offer must stay alive.
            const ok = await this.runGit(async () => {
              await call('undoLastCommit', repo.path, sha)
            }, 'undo')
            if (!ok) return
            this.setDraft(repo.path, {
              summary,
              description,
              checked: new Set(scope)
            })
            this.update({ lastCommit: null, amend: null, view: 'review' })
            void this.loadLog(false)
          })()
        }
      }
    })
  }

  // ------------------------------------------------------------- AI agent

  async generateCommitMessage(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const draft = this.draftFor(repo.path)

    // Same scope rules as committing: the message describes the staged
    // baseline plus the ticked files, never just what is ticked.
    const genStaged = (this.state.status?.files ?? [])
      .filter(f => f.staged)
      .map(f => f.path)
    const genSelected = [...draft.checked]
    const scope =
      genStaged.length === 0
        ? genSelected
        : [...new Set([...genStaged, ...genSelected])]
    if (scope.length === 0) {
      this.toast('error', 'Stage or select at least one file to describe first.')
      return
    }

    // An agent that can only answer 401 should not be asked: route the click
    // to the dialog that fixes it (with a pointer note) when hints are on.
    const settings = this.state.settings
    if (aiLooksUnconfigured(settings)) {
      if (settings?.hintsEnabled === true) {
        this.update({ showSettings: true, settingsAiNote: true })
      } else {
        this.toast(
          'error',
          'The AI agent has no endpoint configured — set one in Preferences first.'
        )
      }
      return
    }

    const hasUserText =
      draft.summary.trim().length > 0 || draft.description.trim().length > 0

    if (
      hasUserText &&
      settings?.confirmOverrideWithGeneratedMessage === true
    ) {
      this.update({
        confirm: {
          title: 'Replace commit message?',
          message:
            'You already typed a commit message. Generating one will replace your summary and description.',
          confirmLabel: 'Replace',
          // The typed message is lost, not kept: this confirmation destroys work.
          tone: 'danger',
          onConfirm: () => {
            this.update({ confirm: null })
            void this.runGeneration(repo.path, scope)
          }
        }
      })
      return
    }

    await this.runGeneration(repo.path, scope)
  }

  private async runGeneration(
    repoPath: string,
    paths: ReadonlyArray<string>
  ): Promise<void> {
    this.update({ aiBusy: true })
    try {
      const result = await call('generateCommitMessage', repoPath, paths)
      const drafts = new Map(this.state.drafts)
      const draft = this.draftFor(repoPath)
      const next = { ...draft, summary: result.title, description: result.description }
      drafts.set(repoPath, next)
      this.update({ drafts, aiBusy: false })
      this.persistDraft(repoPath, next)
    } catch (err) {
      this.update({ aiBusy: false })
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'cancelled') {
        this.toast('info', 'Generation cancelled.')
      } else {
        this.toast('error', message)
      }
    }
  }

  cancelGeneration(): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    void call('cancelGenerateCommitMessage', repo.path).catch(() => undefined)
  }

  // ----------------------------------------------------------------- sync

  async doSync(op: 'fetch' | 'pull' | 'push'): Promise<boolean> {
    const repo = this.state.selectedRepo
    if (repo === null) return false
    this.update({ busy: op })
    try {
      const output = await call(op, repo.path)
      this.update({ busy: null })
      const lines = output
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
      const summary = lines.length > 0 ? lines[lines.length - 1] : 'Done.'
      this.toast(
        'success',
        `${op === 'fetch' ? 'Fetched' : op === 'pull' ? 'Pulled' : 'Pushed'} — ${summary.slice(0, 140)}`
      )
      if (op === 'push') this.celebrate('push')
      await this.refresh()
      void this.refreshBranches()
      void this.refreshStashes()
      if (this.state.view === 'history') void this.loadLog(false)
      return true
    } catch (err) {
      this.update({ busy: null })
      const message = err instanceof Error ? err.message : String(err)
      if (op === 'push' && isNeedsPullRejectionMessage(message)) {
        // The push was rejected only because the remote moved ahead — the
        // recovery is one click away, so the toast carries it.
        this.toast('error', message, [
          { label: 'Pull first', onClick: () => void this.doSync('pull') },
          {
            label: 'Pull and push again',
            onClick: () => void this.pullThenPush()
          }
        ])
      } else {
        this.toast('error', message)
      }
      // A pull that stopped on conflicts leaves the repo mid-merge: make the
      // banner show up instead of only reporting the raw failure.
      await this.refresh()
      return false
    }
  }

  /**
   * The recovery for a push rejected as non-fast-forward: pull, and only if
   * that lands cleanly (no conflict stopping it, no new failure) retry the
   * push. A conflicted pull leaves the merge banner up instead.
   */
  async pullThenPush(): Promise<void> {
    if (!(await this.doSync('pull'))) return
    await this.doSync('push')
  }

  // --------------------------------------------------------------- branches

  async checkoutBranch(name: string, fromRemote?: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      await call('checkoutBranch', repo.path, name, fromRemote)
      await this.refresh()
      await this.refreshBranches()
      void this.loadLog(false)
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  /** Row shortcut: confirm first, then merge (the dialog is its own confirm). */
  requestMergeBranch(name: string, fromRemote?: string): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const target = this.state.status?.branch ?? '(detached)'
    const source =
      fromRemote !== undefined && fromRemote.length > 0
        ? `${fromRemote}/${name}`
        : name
    this.update({
      confirm: {
        title: `Merge "${source}" into "${target}"?`,
        message:
          'Git fast-forwards when possible and creates a merge commit ' +
          'otherwise. If files conflict, the desk switches to conflict ' +
          'resolution so you can finish or abort the merge.',
        confirmLabel: 'Merge branch',
        onConfirm: () => {
          this.update({ confirm: null })
          void this.mergeBranch(name, fromRemote)
        }
      }
    })
  }

  /**
   * Runs the merge. A conflicted merge is not a dead end: git leaves the
   * repo paused mid-merge, refresh() moves the desk to the conflicts view,
   * and the sidebar's banner offers Continue/Abort — so git's raw CONFLICT
   * error is replaced by that explanation. Modelled on doSync: the refresh
   * must happen on the error path too, which runGit deliberately skips.
   */
  async mergeBranch(name: string, fromRemote?: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const target = this.state.status?.branch ?? '(detached)'
    const source =
      fromRemote !== undefined && fromRemote.length > 0
        ? `${fromRemote}/${name}`
        : name
    this.update({ busy: 'merge', mergeBranchOpen: false })
    try {
      const output = await call('mergeBranch', repo.path, name, fromRemote)
      this.update({ busy: null })
      if (/already up to date/i.test(output)) {
        this.toast('info', `Already up to date — "${target}" contains "${source}".`)
      } else {
        const lines = output
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0)
        const summary = lines.length > 0 ? lines[lines.length - 1] : 'Done.'
        this.toast(
          'success',
          `Merged "${source}" into "${target}" — ${summary.slice(0, 140)}`
        )
      }
    } catch (err) {
      this.update({ busy: null })
      const message = err instanceof Error ? err.message : String(err)
      if (/CONFLICT/i.test(message)) {
        this.toast('info', 'Merge conflicts — resolve them to finish the merge.')
      } else {
        this.toast('error', message)
      }
    }
    await this.refresh()
    void this.refreshBranches()
    void this.refreshStashes()
    if (this.state.view === 'history') void this.loadLog(false)
  }

  async createBranch(name: string, startPoint?: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      await call('createBranch', repo.path, name, startPoint)
      this.update({ showNewBranch: false, newBranchBase: null })
      await this.refresh()
      await this.refreshBranches()
      void this.loadLog(false)
      this.toast('success', `Switched to new branch ${name.trim()}`)
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  deleteBranch(name: string, force = false): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({
      confirm: {
        title: `Delete branch "${name}"?`,
        message: force
          ? 'This branch has commits that are not merged into the current branch. Deleting anyway discards them.'
          : `The local branch "${name}" will be deleted.`,
        confirmLabel: force ? 'Delete anyway' : 'Delete branch',
        tone: 'danger',
        onConfirm: async () => {
          this.update({ confirm: null })
          try {
            await call('deleteBranch', repo.path, name, force)
            await this.refreshBranches()
            this.toast('success', `Deleted ${name}`)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            this.toast('error', message)
            if (/not fully merged/i.test(message)) {
              this.update({
                confirm: {
                  title: `Delete "${name}" anyway?`,
                  message:
                    'git reports this branch has commits that are not merged anywhere yet.\n\nDelete anyway and lose those commits?',
                  confirmLabel: 'Delete anyway',
        tone: 'danger',
                  onConfirm: () => {
                    this.update({ confirm: null })
                    void call('deleteBranch', repo.path, name, true)
                      .then(() => this.refreshBranches())
                      .then(() => this.toast('success', `Deleted ${name}`))
                      .catch(e =>
                        this.toast('error', e instanceof Error ? e.message : String(e))
                      )
                  }
                }
              })
            }
          }
        }
      }
    })
  }

  deleteCurrentBranch(): void {
    const branch = this.state.status?.branch
    if (branch === undefined || branch.length === 0 || branch === '(detached)') {
      this.toast('error', 'There is no branch checked out to delete.')
      return
    }
    this.deleteBranch(branch)
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      await call('renameBranch', repo.path, oldName, newName)
      this.update({ renameBranchTarget: null })
      await this.refresh()
      await this.refreshBranches()
      this.toast('success', `Renamed ${oldName} to ${newName.trim()}`)
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  async deleteRemoteBranch(remote: string, name: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({
      confirm: {
        title: `Delete ${remote}/${name}?`,
        message: `The branch will be deleted on ${remote}. Other people will lose it after their next fetch.`,
        confirmLabel: 'Delete on remote',
        tone: 'danger',
        onConfirm: async () => {
          this.update({ confirm: null })
          await this.guarded(
            async () => {
              await call('deleteRemoteBranch', repo.path, remote, name)
            },
            'delete-remote'
          )
          await this.refreshBranches()
        }
      }
    })
  }

  setNewBranchOpen(open: boolean): void {
    this.update({ showNewBranch: open, newBranchBase: open ? this.state.newBranchBase : null })
  }

  setRenameBranchTarget(name: string | null): void {
    this.update({ renameBranchTarget: name })
  }

  setMergeBranchOpen(open: boolean): void {
    this.update({ mergeBranchOpen: open })
  }

  // --------------------------------------------------------------- history

  async selectCommit(commit: CommitInfo): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({
      selectedCommit: commit,
      commitFiles: [],
      commitFilesLoading: true,
      commitFilesError: null,
      selectedCommitFilePath: null,
      selectedCommitFileDiff: null,
      selectedCommitFileError: null,
      selectedCommitFilePreview: null
    })
    try {
      const files = await call('getCommitFiles', repo.path, commit.sha)
      if (this.state.selectedCommit?.sha === commit.sha) {
        this.update({ commitFiles: files, commitFilesLoading: false })
      }
    } catch (err) {
      if (this.state.selectedCommit?.sha === commit.sha) {
        this.update({
          commitFilesLoading: false,
          commitFilesError: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }

  async selectCommitFile(path: string): Promise<void> {
    const repo = this.state.selectedRepo
    const commit = this.state.selectedCommit
    if (repo === null || commit === null) return
    this.update({
      selectedCommitFilePath: path,
      selectedCommitFileDiff: '…',
      selectedCommitFileError: null,
      selectedCommitFilePreview: null
    })
    // The committed blob itself, not the working tree: history must show what
    // the commit contains. (Deleted rows have no blob — the fetch answers null.)
    const preview: Promise<FilePreview | null> = call(
      'getPreview',
      repo.path,
      path,
      commit.sha
    ).catch(() => null)
    try {
      const diff = await call('getCommitFileDiff', repo.path, commit.sha, path)
      if (
        this.state.selectedCommitFilePath === path &&
        this.state.selectedCommit?.sha === commit.sha
      ) {
        this.update({ selectedCommitFileDiff: diff })
      }
    } catch (err) {
      if (
        this.state.selectedCommitFilePath === path &&
        this.state.selectedCommit?.sha === commit.sha
      ) {
        this.update({
          selectedCommitFileDiff: null,
          selectedCommitFileError: err instanceof Error ? err.message : String(err)
        })
      }
    }
    const previewResult = await preview
    if (
      this.state.selectedCommitFilePath === path &&
      this.state.selectedCommit?.sha === commit.sha
    ) {
      this.update({ selectedCommitFilePreview: previewResult })
    }
  }

  copySelectedCommitSha(): void {
    const commit = this.state.selectedCommit
    if (commit === null) {
      this.toast('error', 'Select a commit first.')
      return
    }
    void this.copyText(commit.sha, 'Commit SHA')
  }

  revertSelectedCommit(): void {
    const repo = this.state.selectedRepo
    const commit = this.state.selectedCommit
    if (repo === null || commit === null) {
      this.toast('error', 'Select a commit first.')
      return
    }
    this.update({
      confirm: {
        title: 'Revert this commit?',
        message: `A new commit will be created that undoes "${commit.summary.slice(0, 70)}".`,
        confirmLabel: 'Revert commit',
        onConfirm: async () => {
          this.update({ confirm: null })
          await this.runGit(async () => {
            await call('revertCommit', repo.path, commit.sha)
          }, 'revert')
          void this.loadLog(false)
          if (this.state.selectedCommit !== null) {
            // The reverted commit is gone from the tip; keep the selection but
            // refresh the file list which may now be empty.
            void this.selectCommit({ ...commit })
          }
        }
      }
    })
  }

  cherryPickSelectedCommit(): void {
    const repo = this.state.selectedRepo
    const commit = this.state.selectedCommit
    if (repo === null || commit === null) {
      this.toast('error', 'Select a commit first.')
      return
    }
    const dirty = this.state.status?.files.length ?? 0
    if (dirty > 0) {
      this.toast(
        'error',
        'Commit or stash your local changes before cherry-picking another commit.'
      )
      return
    }
    this.update({
      confirm: {
        title: 'Cherry-pick this commit?',
        message: `"${commit.summary.slice(0, 70)}" will be applied to ${this.state.status?.branch ?? 'the current branch'}.`,
        confirmLabel: 'Cherry-pick',
        onConfirm: async () => {
          this.update({ confirm: null })
          await this.runGit(async () => {
            await call('cherryPickCommit', repo.path, commit.sha)
          }, 'cherry-pick')
          void this.loadLog(false)
        }
      }
    })
  }

  createBranchFromSelectedCommit(): void {
    const commit = this.state.selectedCommit
    if (commit === null) {
      this.toast('error', 'Select a commit first.')
      return
    }
    this.update({
      showNewBranch: true,
      newBranchBase: commit.sha.slice(0, 10)
    })
  }

  // --------------------------------------------------------------- stash

  /** Opens the stash dialog; the verb itself lives in StashDialog. */
  stashAllChanges(): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const count = this.state.status?.files.length ?? 0
    if (count === 0) {
      this.toast('error', 'There is nothing to stash.')
      return
    }
    this.update({ showStash: true })
  }

  setStashOpen(open: boolean): void {
    this.update({ showStash: open })
  }

  /**
   * Stash every working change under an optional message (subject plus
   * body become the stash commit's message). Resolves true on success so
   * the dialog can close itself; failures already carry an error toast.
   */
  async stashWithMessage(
    title: string,
    description: string
  ): Promise<boolean> {
    const repo = this.state.selectedRepo
    if (repo === null) return false
    const subject = title.trim()
    const body = description.trim()
    const message =
      subject.length === 0
        ? undefined
        : body.length === 0
          ? subject
          : `${subject}\n\n${body}`
    const ok = await this.runGit(async () => {
      await call('stashAll', repo.path, message)
    }, 'stash')
    if (ok) {
      await this.refreshStashes()
      this.update({
        showStash: false,
        view: 'stash',
        selectedStashIndex: 0
      })
    }
    return ok
  }

  /**
   * ✨ inside the stash dialog: describe *all* dirty paths (the stash takes
   * everything), returning the draft for the dialog's fields. Shares the
   * commit flow's config guard, busy flag and cancel channel.
   */
  async generateStashDraft(): Promise<GeneratedCommitMessage | null> {
    const repo = this.state.selectedRepo
    if (repo === null) return null
    const settings = this.state.settings
    if (aiLooksUnconfigured(settings)) {
      if (settings?.hintsEnabled === true) {
        this.update({ showSettings: true, settingsAiNote: true })
      } else {
        this.toast(
          'error',
          'The AI agent has no endpoint configured — set one in Preferences first.'
        )
      }
      return null
    }
    const scope = (this.state.status?.files ?? []).map(f => f.path)
    if (scope.length === 0) {
      this.toast('error', 'There is nothing to describe.')
      return null
    }
    this.update({ aiBusy: true })
    try {
      return await call('generateCommitMessage', repo.path, scope)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message !== 'cancelled') this.toast('error', message)
      return null
    } finally {
      this.update({ aiBusy: false })
    }
  }

  /**
   * ✨ on an existing stash: ask the agent to describe that entry's stored
   * diff, then — after a preview confirm — rewrite the entry's message in
   * place. Cancel or a failed confirm leaves the stash untouched.
   */
  async summarizeStash(entry: StashEntry): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null || this.state.busy !== null) return
    const settings = this.state.settings
    if (aiLooksUnconfigured(settings)) {
      if (settings?.hintsEnabled === true) {
        this.update({ showSettings: true, settingsAiNote: true })
      } else {
        this.toast(
          'error',
          'The AI agent has no endpoint configured — set one in Preferences first.'
        )
      }
      return
    }
    this.update({ aiBusy: true })
    let result: GeneratedCommitMessage
    try {
      result = await call('summarizeStash', repo.path, entry.index)
    } catch (err) {
      this.update({ aiBusy: false })
      const message = err instanceof Error ? err.message : String(err)
      if (message !== 'cancelled') this.toast('error', message)
      return
    }
    this.update({ aiBusy: false })
    this.update({
      confirm: {
        title: 'Replace this stash message?',
        message: `${result.title}${
          result.description.length > 0 ? `\n\n${result.description}` : ''
        }`,
        confirmLabel: 'Replace message',
        onConfirm: () => {
          this.update({ confirm: null })
          void this.runGit(async () => {
            await call(
              'setStashMessage',
              repo.path,
              entry.index,
              result.title,
              result.description,
              entry.branch
            )
          }, 'stash-set-message').then(ok => {
            if (ok) void this.refreshStashes()
          })
        }
      }
    })
  }

  restoreStash(entry: StashEntry, pop: boolean): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const dirty = this.state.status?.files.length ?? 0
    if (dirty > 0 && !pop) {
      this.toast(
        'error',
        'Commit or discard your local changes before restoring a stash.'
      )
      return
    }
    void this.runGit(async () => {
      await call(pop ? 'popStash' : 'applyStash', repo.path, entry.index)
    }, pop ? 'stash-pop' : 'stash-apply').then(() => void this.refreshStashes())
  }

  dropStash(entry: StashEntry): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({
      confirm: {
        title: 'Drop this stash?',
        message: `"${entry.message}" will be deleted permanently.`,
        confirmLabel: 'Drop stash',
        tone: 'danger',
        onConfirm: () => {
          this.update({ confirm: null })
          void this.runGit(async () => {
            await call('dropStash', repo.path, entry.index)
          }, 'stash-drop').then(() => void this.refreshStashes())
        }
      }
    })
  }

  // ------------------------------------------------------ dialogs/settings

  setSettingsOpen(open: boolean): void {
    this.update({
      showSettings: open,
      ...(open ? {} : { settingsAiNote: false })
    })
  }

  setCloneOpen(open: boolean): void {
    this.update({ showClone: open })
  }

  setRepoManagerOpen(open: boolean): void {
    this.update({ showRepoManager: open })
  }

  setAboutOpen(open: boolean): void {
    this.update({ showAbout: open })
  }

  // ------------------------------------------------------------------ updates

  /** Last pushed phase — toasts fire on transitions, not on repeats of a
   *  phase a re-check can push again (checking → … → checking → …). */
  private lastUpdatePhase: UpdateState['phase'] | null = null

  /** Mirror main's push and speak only for the moments that matter:
   *  a found update (download note, or the page link for builds that
   *  can't self-apply) and a finished download. Errors and up-to-date
   *  answers come from the manual call itself, so the silent startup
   *  pass never nags. */
  private applyUpdatePush(state: UpdateState): void {
    const repeated = this.lastUpdatePhase === state.phase
    this.lastUpdatePhase = state.phase
    this.update({ update: state })
    if (repeated) return
    if (state.phase === 'ready') {
      this.toast('success', `Aspen ${state.version ?? 'x'} is downloaded.`, [
        {
          label: 'Restart now',
          onClick: () => {
            void this.applyDownloadedUpdate()
          }
        }
      ])
    } else if (state.phase === 'available') {
      if (state.canInstall) {
        this.toast('info', `Downloading Aspen ${state.version ?? 'x'}…`)
      } else {
        this.toast('info', `Aspen ${state.version ?? 'a newer version'} is available.`, [
          {
            label: 'Open releases',
            onClick: () => {
              void call('openExternal', state.releaseUrl)
            }
          }
        ])
      }
    }
  }

  /** Help → "Check for updates…" and the About dialog's button. When an
   *  update already sits downloaded the honest next step is the restart
   *  question, not another round-trip. */
  async checkForUpdatesNow(): Promise<void> {
    const ready = this.state.update
    if (ready !== null && ready.phase === 'ready') {
      this.update({
        confirm: {
          title: 'Restart to update',
          message: `Aspen ${ready.version ?? 'x'} is downloaded. Restart now to install it?`,
          confirmLabel: 'Restart now',
          onConfirm: () => {
            this.dismissConfirm()
            void this.applyDownloadedUpdate()
          }
        }
      })
      return
    }
    try {
      const res = await call('checkForUpdates')
      if (res.status === 'up-to-date') {
        this.toast('info', `Aspen ${res.currentVersion} is the newest release.`)
      } else if (res.status === 'error') {
        this.toast('error', res.error ?? 'The update check failed.', [
          {
            label: 'Open releases',
            onClick: () => {
              void call('openExternal', RELEASES_URL)
            }
          }
        ])
      }
      // 'available': applyUpdatePush already toasted the right action for
      // this build's tier; saying it twice from here would only jingle.
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  /** Hand off to the downloaded installer. In practice the app quits
   *  before the promise answers; a refusal (no download, portable build)
   *  lands as the actionable toast. */
  private async applyDownloadedUpdate(): Promise<void> {
    try {
      await call('quitAndInstallUpdate')
    } catch (err) {
      const url = this.state.update?.releaseUrl ?? RELEASES_URL
      this.toast(
        'error',
        err instanceof Error ? err.message : String(err),
        [
          {
            label: 'Open releases',
            onClick: () => {
              void call('openExternal', url)
            }
          }
        ]
      )
    }
  }

  dismissConfirm(): void {
    this.update({ confirm: null })
  }

  async saveSettings(patch: SettingsPatch): Promise<PublicSettings | null> {
    try {
      const settings = await call('saveSettings', patch)
      this.update({ settings })
      this.applyTheme(settings.theme)
      this.toast('success', 'Settings saved.')
      return settings
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
      return null
    }
  }

  async testAiConnection(config?: {
    baseUrl: string
    model: string
    apiKey?: string
  }): Promise<{ ok: boolean; message: string }> {
    try {
      return await call('testAiConnection', config)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err)
      }
    }
  }

  async saveIdentity(name: string, email: string): Promise<boolean> {
    const repo = this.state.selectedRepo
    if (repo === null) return false
    try {
      await call('setConfigInfo', repo.path, name, email)
      await this.refreshIdentity()
      this.toast('success', 'Author identity saved for this repository.')
      return true
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
      return false
    }
  }

  private async runGit(
    fn: () => Promise<void>,
    busyKey: string
  ): Promise<boolean> {
    this.update({ busy: busyKey })
    try {
      await fn()
      this.update({ busy: null })
      await this.refresh()
      return true
    } catch (err) {
      this.update({ busy: null })
      this.toast('error', err instanceof Error ? err.message : String(err))
      return false
    }
  }
}

export const store = new AppStore()

const StoreContext = createContext(store)

export function useStoreState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

export function useStore(): AppStore {
  return useContext(StoreContext)
}
