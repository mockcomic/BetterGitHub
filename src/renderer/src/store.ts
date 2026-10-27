import {
  createContext,
  useContext,
  useSyncExternalStore
} from 'react'
import type {
  BranchInfo,
  CommitInfo,
  ExternalApp,
  FilePreview,
  FileStatus,
  GitConfigInfo,
  GitHubTarget,
  GitignoreResult,
  IgnoreRequest,
  ManagedRepository,
  PublicSettings,
  Repository,
  RepositoryStatus,
  SettingsPatch,
  StashEntry,
  WorkflowKind
} from '../../shared/models'
import type { MenuAction } from '../../shared/ipc'
import type { ThemeId } from '../../shared/themes'
import { themeBase } from '../../shared/themes'
import { DONATE_URL } from '../../shared/links'
import { isNeedsPullRejectionMessage } from '../../shared/push-rejection'
import { call, onMenuAction, onRepoChanged } from './api'

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
  readonly busy: string | null
  readonly aiBusy: boolean
  /** Last completing-verb success, so the button that did it can celebrate. */
  readonly celebration: CelebrationPulse | null
  readonly settings: PublicSettings | null
  readonly toasts: ReadonlyArray<Toast>
  readonly showSettings: boolean
  readonly showClone: boolean
  readonly showRepoManager: boolean
  readonly showNewBranch: boolean
  readonly newBranchBase: string | null
  readonly renameBranchTarget: string | null
  readonly mergeBranchOpen: boolean
  readonly showAbout: boolean
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
  busy: null,
  aiBusy: false,
  celebration: null,
  settings: null,
  toasts: [],
  showSettings: false,
  showClone: false,
  showRepoManager: false,
  showNewBranch: false,
  newBranchBase: null,
  renameBranchTarget: null,
  mergeBranchOpen: false,
  showAbout: false,
  confirm: null,
  initError: null,
  lastRefreshedAt: null
}

const PAGE_SIZE = 300
const DRAFT_KEY_PREFIX = 'gitdesk.draft.'

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
    this.update({ celebration: { kind, nonce: ++celebrationNonce } })
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
      const [settings, repositories] = await Promise.all([
        call('getSettings'),
        call('listRepositories')
      ])
      this.update({ settings, repositories, initError: null })
      this.applyTheme(settings.theme)

      const lastPath = localStorage.getItem('gitdesk.lastRepo')
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

    onRepoChanged(repoPath => {
      if (
        this.state.selectedRepo !== null &&
        this.state.selectedRepo.path === repoPath &&
        this.state.busy === null &&
        !this.state.aiBusy
      ) {
        void this.refresh({ silent: true })
      }
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
      window.localStorage.setItem('gitdesk.theme', theme)
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
    // concurrently and hit index-lock errors. Read-only refresh is exempt.
    if (
      action !== 'refresh' &&
      action !== 'donate' &&
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
    localStorage.setItem('gitdesk.lastRepo', repo.path)
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
      view: 'review',
      deskFilter: '',
      mergeBranchOpen: false,
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
              ? `"${single}" will be removed from GitDesk. The folder and its git data stay on disk.`
              : `These repositories (${list}${more}) will be removed from GitDesk. The folders and their git data stay on disk.`,
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
        localStorage.removeItem('gitdesk.lastRepo')
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
   * exactly the checked paths, so "what will ship" is honest before commit.
   */
  async recomputeScope(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const draft = this.state.drafts.get(repo.path)
    const checked = draft?.checked ?? new Set<string>()
    if (checked.size === 0) {
      this.update({ scopeAdds: 0, scopeDels: 0, scopeLoading: false })
      return
    }
    const token = ++this.scopeToken
    this.update({ scopeLoading: true })
    const paths = [...checked].slice(0, 40)
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
    if (draft.checked.size === 0 && this.state.amend === null) {
      this.toast('error', 'Select at least one file to commit.')
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
              [...draft.checked]
            )
          : await call(
              'amendCommit',
              repo.path,
              summary,
              draft.description,
              [...draft.checked],
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
          paths: [...draft.checked]
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
    const repo = this.state.selectedRepo
    const last = this.state.lastCommit
    if (repo === null || last === null) {
      this.toast('error', 'There is no GitDesk commit to undo.')
      return
    }
    this.update({
      confirm: {
        title: 'Undo this commit?',
        message: `"${last.summary}" will be undone. Its changes stay in your working directory, ready to commit again.`,
        confirmLabel: 'Undo commit',
        onConfirm: () => {
          this.update({ confirm: null })
          // runGit reports failure via its boolean, not a rejection: on a
          // refused undo (tip moved, repo moved on) the user's current draft
          // must survive untouched and the Undo offer must stay alive.
          void this.runGit(async () => {
            await call('undoLastCommit', repo.path, last.sha)
          }, 'undo').then(ok => {
            if (!ok) return
            this.setDraft(repo.path, {
              summary: last.summary,
              description: last.description,
              checked: new Set(last.paths)
            })
            this.update({ lastCommit: null, amend: null })
            void this.loadLog(false)
          })
        }
      }
    })
  }

  // ------------------------------------------------------------- AI agent

  async generateCommitMessage(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const draft = this.draftFor(repo.path)

    if (draft.checked.size === 0) {
      this.toast('error', 'Select the files you want to include first.')
      return
    }

    const hasUserText =
      draft.summary.trim().length > 0 || draft.description.trim().length > 0
    const settings = this.state.settings

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
            void this.runGeneration(repo.path, [...draft.checked])
          }
        }
      })
      return
    }

    await this.runGeneration(repo.path, [...draft.checked])
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

  stashAllChanges(): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    const count = this.state.status?.files.length ?? 0
    if (count === 0) {
      this.toast('error', 'There is nothing to stash.')
      return
    }
    this.update({
      confirm: {
        title: 'Stash your changes?',
        message: `All ${count} changed file${count === 1 ? '' : 's'} will be moved to the stash and your working directory will be clean. Restore them later from the stash panel.`,
        confirmLabel: 'Stash all',
        onConfirm: async () => {
          this.update({ confirm: null })
          await this.runGit(async () => {
            await call('stashAll', repo.path)
          }, 'stash')
          await this.refreshStashes()
          this.update({ view: 'stash', selectedStashIndex: 0 })
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
    this.update({ showSettings: open })
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
