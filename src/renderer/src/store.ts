import {
  createContext,
  useContext,
  useSyncExternalStore
} from 'react'
import type {
  BranchInfo,
  CommitInfo,
  FileStatus,
  PublicSettings,
  Repository,
  RepositoryStatus,
  SettingsPatch
} from '../../shared/models'
import { call, onMenuAction } from './api'

export interface Toast {
  readonly id: number
  readonly kind: 'info' | 'error' | 'success'
  readonly text: string
}

export interface ConfirmRequest {
  readonly title: string
  readonly message: string
  readonly confirmLabel: string
  readonly onConfirm: () => void
}

export interface RepoDraft {
  summary: string
  description: string
  checked: Set<string>
}

export interface AppState {
  readonly repositories: ReadonlyArray<Repository>
  readonly selectedRepo: Repository | null
  readonly status: RepositoryStatus | null
  readonly statusError: string | null
  readonly branches: ReadonlyArray<BranchInfo>
  readonly commits: ReadonlyArray<CommitInfo>
  readonly activeTab: 'changes' | 'history'
  readonly selectedFilePath: string | null
  readonly selectedFileDiff: string | null
  readonly selectedCommit: CommitInfo | null
  readonly commitFiles: ReadonlyArray<FileStatus>
  readonly selectedCommitFilePath: string | null
  readonly selectedCommitFileDiff: string | null
  readonly drafts: ReadonlyMap<string, RepoDraft>
  readonly busy: string | null
  readonly aiBusy: boolean
  readonly settings: PublicSettings | null
  readonly toasts: ReadonlyArray<Toast>
  readonly showSettings: boolean
  readonly showClone: boolean
  readonly showNewBranch: boolean
  readonly confirm: ConfirmRequest | null
}

const initialState: AppState = {
  repositories: [],
  selectedRepo: null,
  status: null,
  statusError: null,
  branches: [],
  commits: [],
  activeTab: 'changes',
  selectedFilePath: null,
  selectedFileDiff: null,
  selectedCommit: null,
  commitFiles: [],
  selectedCommitFilePath: null,
  selectedCommitFileDiff: null,
  drafts: new Map(),
  busy: null,
  aiBusy: false,
  settings: null,
  toasts: [],
  showSettings: false,
  showClone: false,
  showNewBranch: false,
  confirm: null
}

let toastId = 0

/**
 * Central observable store + action set — a compact take on the
 * AppStore/Dispatcher split observed in the shipped app, per-repository
 * commit drafts mirror its repository state cache.
 */
export class AppStore {
  private state: AppState = initialState
  private listeners = new Set<() => void>()
  private inited = false

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): AppState => this.state

  private update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  toast(kind: Toast['kind'], text: string): void {
    const id = ++toastId
    this.update({ toasts: [...this.state.toasts, { id, kind, text }] })
    setTimeout(() => {
      this.update({
        toasts: this.state.toasts.filter(t => t.id !== id)
      })
    }, kind === 'error' ? 9000 : 5000)
  }

  private draftFor(repoPath: string): RepoDraft {
    const existing = this.state.drafts.get(repoPath)
    if (existing !== undefined) return existing
    return { summary: '', description: '', checked: new Set<string>() }
  }

  private setDraft(repoPath: string, patch: Partial<RepoDraft>): void {
    const drafts = new Map(this.state.drafts)
    const draft = this.draftFor(repoPath)
    drafts.set(repoPath, { ...draft, ...patch })
    this.update({ drafts })
  }

  async init(): Promise<void> {
    if (this.inited) return
    this.inited = true
    try {
      const [settings, repositories] = await Promise.all([
        call('getSettings'),
        call('listRepositories')
      ])
      this.update({ settings, repositories })
      this.applyTheme(settings.theme)

      const lastPath = localStorage.getItem('gitdesk.lastRepo')
      const selected =
        repositories.find(r => r.path === lastPath) ?? repositories[0] ?? null
      if (selected !== null) {
        await this.selectRepo(selected)
      }
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }

    onMenuAction(action => {
      void this.handleMenuAction(action)
    })

    window.addEventListener('focus', () => {
      if (this.state.selectedRepo !== null) void this.refresh()
    })
  }

  private applyTheme(theme: 'system' | 'light' | 'dark'): void {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      document.documentElement.setAttribute(
        'data-theme',
        mq.matches ? 'dark' : 'light'
      )
      mq.addEventListener('change', e => {
        document.documentElement.setAttribute(
          'data-theme',
          e.matches ? 'dark' : 'light'
        )
      })
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }

  private async handleMenuAction(action: string): Promise<void> {
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
        this.update({ showNewBranch: true })
        break
      case 'show-preferences':
        this.update({ showSettings: true })
        break
      case 'add-repository':
        await this.addLocalRepository()
        break
      case 'clone-repository':
        this.update({ showClone: true })
        break
    }
  }

  // ------------------------------------------------------------------ repos

  async selectRepo(repo: Repository): Promise<void> {
    localStorage.setItem('gitdesk.lastRepo', repo.path)
    this.update({
      selectedRepo: repo,
      status: null,
      statusError: null,
      selectedFilePath: null,
      selectedFileDiff: null,
      selectedCommit: null,
      commitFiles: [],
      selectedCommitFilePath: null,
      selectedCommitFileDiff: null,
      activeTab: 'changes'
    })
    await Promise.all([this.refresh(), this.refreshBranches()])
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

  removeRepository(): void {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({
      confirm: {
        title: 'Remove repository',
        message: `"${repo.name}" will be removed from GitDesk. The folder and its git data stay on disk.`,
        confirmLabel: 'Remove',
        onConfirm: async () => {
          this.update({ confirm: null })
          await call('removeRepository', repo.id)
          const repositories = await call('listRepositories')
          this.update({
            repositories,
            selectedRepo: null,
            status: null,
            commits: [],
            branches: []
          })
          localStorage.removeItem('gitdesk.lastRepo')
        }
      }
    })
  }

  async clone(url: string, baseDir: string, folderName: string): Promise<void> {
    const dest = `${baseDir.replace(/[\\/]+$/, '')}/${folderName}`
    this.update({ showClone: false, busy: 'clone' })
    try {
      const output = await call('cloneRepository', url, dest)
      const repositories = await call('listRepositories')
      this.update({ repositories, busy: null })
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

  async refresh(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      const status = await call('getStatus', repo.path)
      const draft = this.draftFor(repo.path)
      const valid = new Set(status.files.map(f => f.path))
      const checked = new Set(
        [...draft.checked].filter(p => valid.has(p))
      )
      this.update({ status, statusError: null })
      if (checked.size !== draft.checked.size) {
        this.setDraft(repo.path, { checked })
      }
      if (this.state.activeTab === 'history') await this.refreshLog()
    } catch (err) {
      this.update({
        status: null,
        statusError: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async refreshBranches(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      const branches = await call('getBranches', repo.path)
      this.update({ branches })
    } catch {
      this.update({ branches: [] })
    }
  }

  async refreshLog(): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      const commits = await call('getLog', repo.path)
      this.update({ commits })
    } catch (err) {
      this.update({ commits: [] })
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  setActiveTab(tab: 'changes' | 'history'): void {
    this.update({ activeTab: tab })
    if (tab === 'history' && this.state.commits.length === 0) {
      void this.refreshLog()
    }
  }

  // ----------------------------------------------------------------- files

  private fileByPath(path: string): FileStatus | undefined {
    return this.state.status?.files.find(f => f.path === path)
  }

  async selectFile(path: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({ selectedFilePath: path, selectedFileDiff: '…' })
    try {
      const entry = this.fileByPath(path)
      const diff = await call(
        'getPathDiff',
        repo.path,
        path,
        entry?.oldPath ?? undefined
      )
      if (this.state.selectedFilePath === path) {
        this.update({ selectedFileDiff: diff })
      }
    } catch (err) {
      this.update({ selectedFileDiff: null })
      this.toast('error', err instanceof Error ? err.message : String(err))
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
        onConfirm: async () => {
          this.update({ confirm: null })
          const entry = this.fileByPath(path)
          const paths =
            entry?.oldPath !== undefined ? [path, entry.oldPath!] : [path]
          await this.runGit(async () => {
            await call('discardPaths', repo.path, paths)
          }, 'discard')
          if (this.state.selectedFilePath === path) {
            this.update({ selectedFilePath: null, selectedFileDiff: null })
          }
        }
      }
    })
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
    if (draft.checked.size === 0) {
      this.toast('error', 'Select at least one file to commit.')
      return
    }

    this.update({ busy: 'commit' })
    try {
      const sha = await call(
        'commitPaths',
        repo.path,
        draft.summary,
        draft.description,
        [...draft.checked]
      )
      this.setDraft(repo.path, {
        summary: '',
        description: '',
        checked: new Set()
      })
      this.toast(
        'success',
        `Committed ${sha.slice(0, 7)} — ${draft.summary.trim().slice(0, 60)}`
      )
      this.update({ busy: null })
      await this.refresh()
      void this.refreshBranches()
      if (this.state.activeTab === 'history') void this.refreshLog()
    } catch (err) {
      this.update({ busy: null })
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
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
      drafts.set(repoPath, {
        ...draft,
        summary: result.title,
        description: result.description
      })
      this.update({ drafts, aiBusy: false })
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

  async doSync(op: 'fetch' | 'pull' | 'push'): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
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
      await this.refresh()
      void this.refreshBranches()
      if (this.state.activeTab === 'history') void this.refreshLog()
    } catch (err) {
      this.update({ busy: null })
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  // --------------------------------------------------------------- branches

  async checkoutBranch(name: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      await call('checkoutBranch', repo.path, name)
      await this.refresh()
      await this.refreshBranches()
      void this.refreshLog()
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  async createBranch(name: string): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    try {
      await call('createBranch', repo.path, name)
      this.update({ showNewBranch: false })
      await this.refresh()
      await this.refreshBranches()
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  // --------------------------------------------------------------- history

  async selectCommit(commit: CommitInfo): Promise<void> {
    const repo = this.state.selectedRepo
    if (repo === null) return
    this.update({
      selectedCommit: commit,
      commitFiles: [],
      selectedCommitFilePath: null,
      selectedCommitFileDiff: null
    })
    try {
      const files = await call('getCommitFiles', repo.path, commit.sha)
      if (this.state.selectedCommit?.sha === commit.sha) {
        this.update({ commitFiles: files })
      }
    } catch (err) {
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  async selectCommitFile(path: string): Promise<void> {
    const repo = this.state.selectedRepo
    const commit = this.state.selectedCommit
    if (repo === null || commit === null) return
    this.update({ selectedCommitFilePath: path, selectedCommitFileDiff: '…' })
    try {
      const diff = await call('getCommitFileDiff', repo.path, commit.sha, path)
      if (this.state.selectedCommitFilePath === path) {
        this.update({ selectedCommitFileDiff: diff })
      }
    } catch (err) {
      this.update({ selectedCommitFileDiff: null })
      this.toast('error', err instanceof Error ? err.message : String(err))
    }
  }

  // ------------------------------------------------------ dialogs/settings

  setSettingsOpen(open: boolean): void {
    this.update({ showSettings: open })
  }

  setCloneOpen(open: boolean): void {
    this.update({ showClone: open })
  }

  setNewBranchOpen(open: boolean): void {
    this.update({ showNewBranch: open })
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

  async testAiConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      return await call('testAiConnection')
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err)
      }
    }
  }

  private async runGit(
    fn: () => Promise<void>,
    busyKey: string
  ): Promise<void> {
    this.update({ busy: busyKey })
    try {
      await fn()
      this.update({ busy: null })
      await this.refresh()
    } catch (err) {
      this.update({ busy: null })
      this.toast('error', err instanceof Error ? err.message : String(err))
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
