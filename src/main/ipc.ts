import { clipboard, dialog, ipcMain, shell } from 'electron'
import { existsSync, statSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import type {
  ExternalApp,
  GitHubTarget,
  IgnoreRequest,
  IpcResult,
  MergeExchange,
  RemoteRepoQuery,
  RepoSummaryEntry,
  Repository
} from '../shared/models'
import type {
  MenuAction,
  MenuRole,
  RequestResponseChannel,
  RequestResponseChannels
} from '../shared/ipc'
import { friendlyGitError, execGit } from './git/exec'
import { safeJoin } from './git/repo-path'
import { getDetectedApps, launchDetached, openRepoInApp } from './external-apps'
import { getStatus } from './git/status'
import { getCommitFileDiff, getCommitFileNames, getPathsDiffText, getPathDiff } from './git/diff'
import { getPreview } from './git/preview'
import {
  checkoutBranch,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  getBranches,
  mergeBranch,
  renameBranch
} from './git/branches'
import {
  amendCommit,
  cherryPickCommit,
  commitPaths,
  revertCommit,
  undoLastCommit
} from './git/commit'
import {
  discardPaths,
  getConflictStages,
  resolveConflict,
  stagePaths,
  unstagePaths
} from './git/staging'
import { abortOperation, continueOperation } from './git/workflow'
import {
  applyStash,
  dropStash,
  listStashes,
  popStash,
  stashAll
} from './git/stash'
import {
  appendGitignoreRules,
  buildIgnoreRules,
  gitignoreRuleFor,
  trackedInScopeOf
} from './git/ignore'
import {
  branchUrl,
  commitUrl,
  toWebRepository,
  compareUrl
} from './git/github-url'
import { getLog } from './git/log'
import {
  addRemote,
  cloneRepository,
  fetch,
  getConfigInfo,
  getRemoteUrl,
  pull,
  push,
  setConfigInfo,
  suggestedCloneDirectory,
  verifyRepository
} from './git/sync'
import {
  addRepository,
  getAiConfig,
  getPublicSettings,
  listRepositories,
  removeRepositoriesByIds,
  saveSettings
} from './settings'
import {
  addAccount,
  getAccount,
  getAccountToken,
  listAccounts,
  removeAccount as forgetAccount
} from './accounts'
import { beginSignIn, cancelSignIn, pollSignIn } from './providers/oauth'
import { githubClient, normalizeGitHubApiBase } from './providers/github'
import { gitlabClient, normalizeGitLabApiBase } from './providers/gitlab'
import { ProviderHttpError } from './providers/http'
import type { AccountProvider } from '../shared/models'
import { generateCommitMessage, testConnection } from './ai/commit-agent'
import {
  askMergeAgent,
  buildMergeMessages,
  describeStages,
  generateMergePromptTags,
  hasConflictMarkers,
  mergeSizeError,
  restoreEol
} from './ai/merge-agent'
import { dispatchMenuAction, getMenuBarSpec, runMenuRole } from './menu'
import { applyTheme, getMainWindow, isTrustedSender } from './windows'
import { getWatchedPath, startWatching, stopWatching } from './watcher'

type Handlers = {
  [K in RequestResponseChannel]: (
    ...args: Parameters<RequestResponseChannels[K]>
  ) => Promise<Awaited<ReturnType<RequestResponseChannels[K]>>>
}

const generationControllers = new Map<string, AbortController>()

/** In-flight AI merge requests, keyed by `repoPath\npath`. */
const mergeControllers = new Map<string, AbortController>()

async function openUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Refusing to open a non-http(s) URL: ${url}`)
  }
  await shell.openExternal(url)
}

async function resolveWebRepo(repoPath: string) {
  const repo = toWebRepository(await getRemoteUrl(repoPath))
  if (repo === null) {
    throw new Error(
      'No browsable URL for this repository — the origin remote is missing or not an http/ssh URL.'
    )
  }
  return repo
}

/**
 * For an unmerged path, the stage contents the working file cannot show: any
 * of ours/theirs that is not present verbatim in what is on disk (a side
 * deleted on one hand leaves the other side in the file without markers, so
 * most ordinary conflicts need nothing extra here). Each added block is
 * fenced with its own random tag, mirroring the commit agent's trust posture.
 */
async function readMissingStages(
  repoPath: string,
  path: string,
  stages: ReadonlySet<number>,
  workingContent: string
): Promise<string> {
  const blocks: string[] = []
  for (const [n, label] of [
    [2, 'our side'],
    [3, 'their incoming side']
  ] as const) {
    if (!stages.has(n)) continue
    let text: string
    try {
      text = (
        await execGit(['show', `:${n}:${path}`], {
          cwd: repoPath,
          timeoutMs: 10_000
        })
      ).stdout
    } catch {
      // Stage vanished under a concurrent change; the description still
      // tells the agent what kind of conflict this is.
      continue
    }
    // Compare against the working text with CRLF folded to LF: repo blobs
    // are LF-normalized while a Windows working tree may be CRLF, so a raw
    // substring test would re-send every side as an extra block.
    if (workingContent.replace(/\r\n/g, '\n').includes(text)) continue
    if (text.includes('\u0000')) {
      throw new Error(
        `The ${label} version is binary — the AI merge agent only merges text. Resolve it by hand.`
      )
    }
    const tooBig = mergeSizeError(text)
    if (tooBig !== null) {
      throw new Error(
        `The ${label} version is too large for the AI merge agent. Resolve it by hand.`
      )
    }
    const tag = Math.random().toString(36).slice(2, 10)
    blocks.push(
      `\nContent missing from the working file — ${label}:\n<stage-${tag}>\n${text}\n</stage-${tag}>`
    )
  }
  return blocks.join('\n')
}

const handlers: Handlers = {
  async listRepositories() {
    return listRepositories()
  },
  async addRepository(path: string) {
    await verifyRepository(path)
    return addRepository(path)
  },
  async selectDirectories() {
    const parent = getMainWindow() ?? undefined
    const result = await dialog.showOpenDialog(parent!, {
      properties: ['openDirectory', 'createDirectory', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  },
  async addRepositories(paths) {
    const added: Repository[] = []
    const skipped: Repository[] = []
    const failed: { path: string; error: string }[] = []
    // One bad folder must not abort the batch; each item resolves on its own.
    for (const path of paths) {
      const existing = (await listRepositories()).find(
        r => r.path === join(path)
      )
      if (existing !== undefined) {
        skipped.push({ id: existing.id, path: existing.path, name: existing.name })
        continue
      }
      try {
        await verifyRepository(path)
        added.push(await addRepository(path))
      } catch (err) {
        failed.push({ path, error: friendlyGitError(err) })
      }
    }
    return { added, skipped, failed }
  },
  async getRepoSummaries(paths) {
    // Bounded fan-out: the manager may list dozens of repos and each summary
    // runs real git. A folder that fails reports unreadable cells, never
    // invented zeroes.
    const entries: RepoSummaryEntry[] = []
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < paths.length) {
        const path = paths[next++]
        try {
          const [status, log] = await Promise.all([
            getStatus(path),
            getLog(path, { maxCount: 1 }).catch(() => [])
          ])
          entries.push({
            path,
            summary: {
              branch: status.branch,
              dirty: status.files.length,
              conflicts: status.conflictCount,
              ahead: status.ahead,
              behind: status.behind,
              hasUpstream: status.upstream !== undefined,
              lastCommitAt: log[0]?.date ?? null,
              unreadable: false
            }
          })
        } catch {
          entries.push({
            path,
            summary: {
              branch: null,
              dirty: 0,
              conflicts: 0,
              ahead: 0,
              behind: 0,
              hasUpstream: false,
              lastCommitAt: null,
              unreadable: true
            }
          })
        }
      }
    }
    const width = Math.max(1, Math.min(4, paths.length))
    await Promise.all(Array.from({ length: width }, () => worker()))
    return entries
  },
  async removeRepositories(ids, deleteFromDisk) {
    const removed = await removeRepositoriesByIds(ids)
    const trashFailed: { path: string; error: string }[] = []
    if (deleteFromDisk) {
      for (const repo of removed) {
        if (!existsSync(repo.path)) continue
        try {
          await shell.trashItem(repo.path)
        } catch (err) {
          // A locked or already-gone folder must not abort the rest.
          trashFailed.push({
            path: repo.path,
            error: err instanceof Error ? err.message : String(err)
          })
        }
      }
    }
    const watched = getWatchedPath()
    if (
      watched !== null &&
      removed.some(r => resolve(r.path) === watched)
    ) {
      stopWatching()
    }
    for (const repo of removed) {
      generationControllers.get(repo.path)?.abort()
      generationControllers.delete(repo.path)
    }
    return { removed: removed.length, trashFailed }
  },
  async getSettings() {
    return getPublicSettings()
  },
  async saveSettings(patch) {
    const settings = await saveSettings(patch)
    // A theme patch must re-skin the OS-drawn chrome (nativeTheme source,
    // background, and win32 frame) immediately, not just on next launch; a
    // no-op repaint is cheap when the patch touched something else.
    applyTheme(settings.theme)
    return settings
  },
  async selectDirectory() {
    const parent = getMainWindow() ?? undefined
    const result = await dialog.showOpenDialog(parent!, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  },
  async testAiConnection(config?: { baseUrl: string; model: string; apiKey?: string }) {
    // When the settings dialog passes its pending edits, test those instead
    // of the persisted config — testing must not require saving first.
    const cfg =
      config !== undefined
        ? {
            ...(await getAiConfig()),
            baseUrl: config.baseUrl,
            model: config.model,
            // An empty box means "keep the stored key", matching save semantics.
            apiKey: config.apiKey?.length ? config.apiKey : (await getAiConfig()).apiKey
          }
        : await getAiConfig()
    return testConnection(cfg.baseUrl, cfg.apiKey ?? '', cfg.model)
  },
  async suggestCloneFolder(url: string) {
    return suggestedCloneDirectory(url)
  },

  // ---------------------------------------------------------- hosted accounts
  async listAccounts() {
    return listAccounts()
  },
  async signInWithToken(provider: AccountProvider, token: string, apiBase?: string) {
    const trimmed = token.trim()
    if (trimmed.length === 0) {
      throw new Error('Paste a token — GitHub classic needs the `repo` scope, GitLab `read_api` + `read_user`.')
    }
    const base =
      provider === 'github'
        ? normalizeGitHubApiBase(apiBase)
        : normalizeGitLabApiBase(apiBase)
    const client = provider === 'github' ? githubClient : gitlabClient
    // Validate before persisting: a wrong token must not half-sign-in.
    const identity = await client.validate(base, trimmed, 'pat')
    return addAccount({
      provider,
      apiBase: base,
      authKind: 'pat',
      identity,
      credential: { token: trimmed, refreshToken: null, expiresAt: null }
    })
  },
  async beginSignIn(provider: AccountProvider, apiBase?: string) {
    return beginSignIn(provider, apiBase)
  },
  async pollSignIn(requestId: string) {
    return pollSignIn(requestId)
  },
  async cancelSignIn(requestId: string) {
    cancelSignIn(requestId)
  },
  async removeAccount(id: string) {
    await forgetAccount(id)
  },
  async listRemoteRepositories(accountId: string, query?: RemoteRepoQuery) {
    const account = await getAccount(accountId)
    if (account === null) {
      throw new Error('That account is no longer signed in — sign in again.')
    }
    const client = account.provider === 'github' ? githubClient : gitlabClient
    const request = {
      search: query?.search?.trim() ?? '',
      cursor: query?.cursor ?? null,
      perPage: query?.perPage ?? 50
    }
    const token = await getAccountToken(account)
    if (token === null) {
      throw new Error(`Aspen could not read ${account.login}'s stored token — sign in again.`)
    }
    try {
      return await client.listRepos(account.apiBase, account, token, account.authKind, request)
    } catch (err) {
      // An expired GitLab oauth token refreshes once, on the failure itself,
      // before the error reaches the list view.
      if (
        err instanceof ProviderHttpError &&
        err.status === 401 &&
        account.authKind === 'oauth'
      ) {
        const fresh = await getAccountToken(account, { forceRefresh: true })
        if (fresh !== null && fresh !== token) {
          return client.listRepos(account.apiBase, account, fresh, account.authKind, request)
        }
      }
      throw err
    }
  },

  async startWatching(repoPath: string) {
    startWatching(repoPath)
  },
  async stopWatching() {
    stopWatching()
  },

  async getStatus(repoPath: string) {
    return getStatus(repoPath)
  },
  async stagePaths(repoPath: string, paths: ReadonlyArray<string>) {
    await stagePaths(repoPath, paths)
  },
  async unstagePaths(repoPath: string, paths: ReadonlyArray<string>) {
    await unstagePaths(repoPath, paths)
  },
  async discardPaths(repoPath: string, paths: ReadonlyArray<string>) {
    await discardPaths(repoPath, paths)
  },
  async resolveConflict(
    repoPath: string,
    path: string,
    side: 'ours' | 'theirs' | 'resolved'
  ) {
    await resolveConflict(repoPath, path, side)
  },
  async addToGitignore(repoPath: string, path: string, request: IgnoreRequest) {
    let rules: string[]
    let trackedPaths: string[]
    if (request.mode === 'allUntracked') {
      const status = await getStatus(repoPath)
      const untracked = status.files.filter(f => f.untracked)
      if (untracked.length === 0) {
        throw new Error('There are no untracked files to ignore.')
      }
      rules = untracked.map(f => {
        let isDirectory = false
        try {
          isDirectory = statSync(safeJoin(repoPath, f.path)).isDirectory()
        } catch {
          isDirectory = false
        }
        return gitignoreRuleFor(f.path, isDirectory)
      })
      trackedPaths = status.files.filter(f => !f.untracked).map(f => f.path)
    } else {
      const target = safeJoin(repoPath, path)
      let isDirectory = false
      try {
        isDirectory = statSync(target).isDirectory()
      } catch {
        isDirectory = false
      }
      rules = buildIgnoreRules(path, isDirectory, request)
      if (rules.length === 0) {
        throw new Error(`Nothing to ignore for ${path} with that scope.`)
      }
      const status = await getStatus(repoPath)
      trackedPaths = status.files.filter(f => !f.untracked).map(f => f.path)
      // Check tracked state BEFORE writing the rule: if the promise in the
      // error ("…then ignore it again") is honored, the retry must not
      // no-op on the already-present rule while the file stays tracked.
      if (
        request.mode === 'file' &&
        trackedPaths.some(f => f === path)
      ) {
        throw new Error(
          `${path} is already tracked. Discard or unstage it first, then ignore it again.`
        )
      }
    }
    const appended = await appendGitignoreRules(repoPath, rules)
    return {
      appended,
      trackedInScope: trackedInScopeOf(rules, trackedPaths)
    }
  },

  async getPathDiff(repoPath: string, path: string, oldPath?: string) {
    return getPathDiff(repoPath, path, oldPath)
  },
  async getCommitFileDiff(repoPath: string, sha: string, path: string) {
    return getCommitFileDiff(repoPath, sha, path)
  },
  async getPreview(repoPath: string, path: string, sha?: string) {
    return getPreview(repoPath, path, sha)
  },
  async getCommitFiles(repoPath: string, sha: string) {
    const files = await getCommitFileNames(repoPath, sha)
    return files.map(f => ({
      path: f.path,
      oldPath: f.oldPath,
      indexCode: f.code[0] ?? '.',
      worktreeCode: '.',
      kind:
        f.code[0] === 'A'
          ? ('new' as const)
          : f.code[0] === 'D'
            ? ('deleted' as const)
            : f.code[0] === 'R'
              ? ('renamed' as const)
              : f.code[0] === 'C'
                ? ('copied' as const)
                : f.code[0] === 'T'
                  ? ('type-changed' as const)
                  : ('modified' as const),
      staged: true,
      hasWorktreeChanges: false,
      untracked: false
    }))
  },

  async commitPaths(
    repoPath: string,
    summary: string,
    description: string,
    selectedPaths: ReadonlyArray<string>,
    stagedPaths?: ReadonlyArray<string>
  ) {
    return commitPaths(
      repoPath,
      summary,
      description,
      selectedPaths,
      stagedPaths ?? []
    )
  },
  async amendCommit(
    repoPath: string,
    summary: string,
    description: string,
    paths: ReadonlyArray<string>,
    expectedSha?: string
  ) {
    return amendCommit(repoPath, summary, description, paths, expectedSha)
  },
  async undoLastCommit(repoPath: string, expectedSha: string) {
    await undoLastCommit(repoPath, expectedSha)
  },
  async revertCommit(repoPath: string, sha: string) {
    await revertCommit(repoPath, sha)
  },
  async cherryPickCommit(repoPath: string, sha: string) {
    const status = await getStatus(repoPath)
    if (status.files.length > 0) {
      throw new Error(
        'Commit or stash your local changes before cherry-picking another commit.'
      )
    }
    await cherryPickCommit(repoPath, sha)
  },

  async continueOperation(repoPath, kind) {
    await continueOperation(repoPath, kind)
  },
  async abortOperation(repoPath, kind) {
    await abortOperation(repoPath, kind)
  },

  async listStashes(repoPath: string) {
    return listStashes(repoPath)
  },
  async stashAll(repoPath: string, message?: string) {
    await stashAll(repoPath, message)
  },
  async applyStash(repoPath: string, index: number) {
    await applyStash(repoPath, index)
  },
  async popStash(repoPath: string, index: number) {
    await popStash(repoPath, index)
  },
  async dropStash(repoPath: string, index: number) {
    await dropStash(repoPath, index)
  },

  async getBranches(repoPath: string) {
    return getBranches(repoPath)
  },
  async checkoutBranch(repoPath: string, name: string, fromRemote?: string) {
    await checkoutBranch(repoPath, name, fromRemote)
  },
  async mergeBranch(repoPath: string, name: string, fromRemote?: string) {
    // All preconditions (detached HEAD, paused workflow, dirty tree,
    // self-merge) are enforced inside the git module, so this handler is a
    // plain pass-through like its checkout/delete siblings.
    return mergeBranch(repoPath, name, fromRemote)
  },
  async createBranch(repoPath: string, name: string, startPoint?: string) {
    await createBranch(repoPath, name, startPoint)
  },
  async deleteBranch(repoPath: string, name: string, force: boolean) {
    await deleteBranch(repoPath, name, force)
  },
  async renameBranch(repoPath: string, oldName: string, newName: string) {
    await renameBranch(repoPath, oldName, newName)
  },
  async deleteRemoteBranch(repoPath: string, remote: string, name: string) {
    await deleteRemoteBranch(repoPath, remote, name)
  },

  async getLog(repoPath: string, query) {
    return getLog(repoPath, query)
  },

  async fetch(repoPath: string) {
    return fetch(repoPath)
  },
  async push(repoPath: string) {
    return push(repoPath)
  },
  async pull(repoPath: string) {
    return pull(repoPath)
  },
  async getRemoteUrl(repoPath: string) {
    return getRemoteUrl(repoPath)
  },
  async addRemote(repoPath: string, url: string) {
    await addRemote(repoPath, url)
  },
  async getConfigInfo(repoPath: string) {
    return getConfigInfo(repoPath)
  },
  async setConfigInfo(repoPath: string, name: string, email: string) {
    await setConfigInfo(repoPath, name, email)
  },
  async cloneRepository(url: string, destinationPath: string) {
    const output = await cloneRepository(url, destinationPath)
    const path = destinationPath
    await addRepository(path)
    return output.length > 0 ? output : `Cloned ${url} into ${path}`
  },
  async viewOnGitHub(repoPath: string, target: GitHubTarget) {
    const repo = await resolveWebRepo(repoPath)
    switch (target.kind) {
      case 'repo':
        await openUrl(repo.webUrl)
        return
      case 'commit':
        await openUrl(commitUrl(repo, target.sha))
        return
      case 'branch':
        await openUrl(branchUrl(repo, target.branch))
        return
      case 'compare':
        await openUrl(compareUrl(repo, target.base, target.branch))
        return
    }
  },

  async revealInFolder(repoPath: string, path: string) {
    const target = safeJoin(repoPath, path)
    if (!existsSync(target)) {
      throw new Error(`${path} does not exist on disk any more.`)
    }
    if (process.platform === 'win32') {
      // shell.showItemInFolder is fire-and-forget — when the shell refuses it
      // the menu item looks dead, because nothing can report the failure.
      // Launching explorer ourselves gives a real error path (launchDetached
      // explains why the exit code can't be the failure signal).
      try {
        await launchDetached('explorer.exe', [`/select,${target}`])
        return
      } catch {
        // Best effort: fall back to Electron's own reveal.
        shell.showItemInFolder(target)
        return
      }
    }
    shell.showItemInFolder(target)
  },
  async openFile(repoPath: string, path: string) {
    const target = safeJoin(repoPath, path)
    if (!existsSync(target)) {
      throw new Error(`${path} does not exist on disk any more.`)
    }
    const failure = await shell.openPath(target)
    if (failure.length === 0) return
    // A reported failure usually means the type has no usable open command —
    // an extension with no association at all (`.md`), or one pointing at a
    // ProgID that no longer exists (`assoc .gitignore=txtfile` with no
    // HKEY_CLASSES_ROOT\txtfile). ShellExecute hides that behind a generic
    // string, so ask the shell for its own "How do you want to open this?"
    // picker instead of ending on a dead menu item.
    try {
      await launchDetached('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', target])
    } catch {
      throw new Error(
        `Could not open ${path}: ${failure}. Windows has no app associated with this file type.`
      )
    }
  },
  async openExternal(url: string) {
    await openUrl(url)
  },
  async writeClipboard(text: string) {
    clipboard.writeText(text)
  },
  async listExternalApps(refresh?: boolean) {
    const detected = await getDetectedApps(refresh === true)
    const apps: ExternalApp[] = detected.map(d => d.app)
    return apps
  },
  async openInExternalApp(repoPath: string, appId: string) {
    await openRepoInApp(repoPath, appId)
  },

  // The win32 title band: menu data for its dropdowns, action forwarding
  // through the same route the native bar's clicks use, and role items run
  // against the window here in main (src/main/menu.ts).
  async getMenuBar() {
    return getMenuBarSpec()
  },
  async triggerMenuAction(action: MenuAction) {
    dispatchMenuAction(action)
  },
  async runMenuRole(role: MenuRole) {
    runMenuRole(role)
  },

  async generateCommitMessage(
    repoPath: string,
    paths: ReadonlyArray<string>
  ) {
    const cfg = await getAiConfig()
    if (cfg.apiKey === null || cfg.apiKey.length === 0) {
      throw new Error(
        'No API key configured. Open Preferences → AI agent and add one.'
      )
    }

    const status = await getStatus(repoPath)
    const statusByPath = new Map(
      status.files.map(f => [f.path, { untracked: f.untracked, oldPath: f.oldPath }])
    )
    const diff = await getPathsDiffText(repoPath, paths, statusByPath)
    if (diff.trim().length === 0) {
      throw new Error('There are no changes in the selected files to describe.')
    }

    generationControllers.get(repoPath)?.abort()
    const controller = new AbortController()
    generationControllers.set(repoPath, controller)

    try {
      return await generateCommitMessage({
        diff,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: cfg.apiKey,
        customInstructions: cfg.customInstructions,
        signal: controller.signal
      })
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || controller.signal.aborted)
      ) {
        throw new Error('cancelled')
      }
      throw err
    } finally {
      if (generationControllers.get(repoPath) === controller) {
        generationControllers.delete(repoPath)
      }
    }
  },
  async cancelGenerateCommitMessage(repoPath: string) {
    generationControllers.get(repoPath)?.abort()
    generationControllers.delete(repoPath)
  },

  async aiResolveConflict(
    repoPath: string,
    path: string,
    exchanges: ReadonlyArray<MergeExchange>
  ) {
    const cfg = await getAiConfig()
    if (cfg.apiKey === null || cfg.apiKey.length === 0) {
      throw new Error(
        'No API key configured. Open Preferences → AI agent and add one.'
      )
    }

    // The file must still be unmerged in the index — the renderer's idea of
    // a conflict can be stale after a watcher push.
    const stages = await getConflictStages(repoPath, path)
    if (stages.size === 0) {
      throw new Error(`"${path}" is not conflicted anymore.`)
    }

    const filePath = safeJoin(repoPath, path)
    let content: string
    try {
      content = await readFile(filePath, 'utf8')
    } catch {
      // Deleted on one side of the conflict: the agent still merges from the
      // index stages, so an absent working file is not fatal.
      content = ''
    }
    const tooBig = mergeSizeError(content)
    if (tooBig !== null) throw new Error(tooBig)

    // The working file already carries both sides inside the markers; only
    // the stages the file cannot show (a side that has no working presence)
    // are added, each in its own random-tagged block.
    const stageBlocks = await readMissingStages(repoPath, path, stages, content)

    const controller = new AbortController()
    const key = `${repoPath}\n${path}`
    mergeControllers.get(key)?.abort()
    mergeControllers.set(key, controller)

    try {
      const decision = await askMergeAgent({
        messages: buildMergeMessages({
          path,
          content,
          stageDescription: describeStages(stages),
          stageBlocks,
          exchanges,
          tags: generateMergePromptTags()
        }),
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: cfg.apiKey,
        signal: controller.signal
      })

      if (decision.kind === 'ask') {
        return { kind: 'ask' as const, questions: decision.questions }
      }

      if (hasConflictMarkers(decision.content)) {
        throw new Error(
          'The proposed resolution still contains conflict markers — nothing was changed. Answer its questions or resolve by hand.'
        )
      }
      await writeFile(filePath, restoreEol(decision.content, content), 'utf8')
      await resolveConflict(repoPath, path, 'resolved')
      return {
        kind: 'resolved' as const,
        summary:
          decision.summary.length > 0
            ? decision.summary
            : 'The AI agent merged the conflict.'
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || controller.signal.aborted)
      ) {
        throw new Error('cancelled')
      }
      throw err
    } finally {
      if (mergeControllers.get(key) === controller) {
        mergeControllers.delete(key)
      }
    }
  },
  async cancelAiResolve(repoPath: string, path: string) {
    const key = `${repoPath}\n${path}`
    mergeControllers.get(key)?.abort()
    mergeControllers.delete(key)
  }
}

export function registerIpc(): void {
  for (const channel of Object.keys(handlers) as RequestResponseChannel[]) {
    ipcMain.handle(
      channel,
      async (event, ...args): Promise<IpcResult<unknown>> => {
        if (!isTrustedSender(event.sender.id)) {
          return { ok: false, error: `Untrusted IPC sender for ${channel}` }
        }
        try {
          // The handler map is exhaustive over the channel keys, so the
          // cast here keeps TS out of the variadic argument dance.
          const fn = handlers[channel] as (...a: unknown[]) => Promise<unknown>
          const data = await fn(...args)
          return { ok: true, data }
        } catch (err) {
          return { ok: false, error: friendlyGitError(err) }
        }
      }
    )
  }
}
