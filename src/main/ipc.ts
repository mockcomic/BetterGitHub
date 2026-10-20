import { clipboard, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { join, resolve, sep } from 'path'
import type {
  GitHubTarget,
  IpcResult,
  RepoSummaryEntry,
  Repository
} from '../shared/models'
import type {
  RequestResponseChannel,
  RequestResponseChannels
} from '../shared/ipc'
import { friendlyGitError } from './git/exec'
import { logDiagnostics } from './diagnostics'
import { getStatus } from './git/status'
import { getCommitFileDiff, getCommitFileNames, getPathsDiffText, getPathDiff } from './git/diff'
import {
  checkoutBranch,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  getBranches,
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
import { appendGitignoreRule, gitignoreRuleFor } from './git/ignore'
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
import { generateCommitMessage, testConnection } from './ai/commit-agent'
import { getMainWindow, isTrustedSender } from './windows'
import { getWatchedPath, startWatching, stopWatching } from './watcher'

type Handlers = {
  [K in RequestResponseChannel]: (
    ...args: Parameters<RequestResponseChannels[K]>
  ) => Promise<Awaited<ReturnType<RequestResponseChannels[K]>>>
}

const generationControllers = new Map<string, AbortController>()

/**
 * Resolves a repository-relative path (forward slashes, as git reports them)
 * against the repository root and refuses anything that escapes it.
 */
function safeJoin(repoPath: string, path: string): string {
  const root = resolve(repoPath)
  const target = resolve(root, ...path.split('/').filter(p => p.length > 0))
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Refusing to touch a path outside the repository: ${path}`)
  }
  return target
}

async function openUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Refusing to open a non-http(s) URL: ${url}`)
  }
  // TEMP [dbg-vog] while chasing "View on GitHub does nothing".
  logDiagnostics(
    `[dbg-vog] openUrl: calling shell.openExternal(${url}) env SystemRoot=${JSON.stringify(
      process.env['SystemRoot'] ?? process.env['SYSTEMROOT'] ?? null
    )} windir=${JSON.stringify(process.env['windir'] ?? null)} ComSpec=${JSON.stringify(
      process.env['ComSpec'] ?? null
    )} pathLen=${(process.env['PATH'] ?? '').length} dshVars=${Object.keys(process.env)
      .filter(k => k.startsWith('DSH_') || k.startsWith('ELECTRON_'))
      .join(',')} cwd=${process.cwd()}`
  )
  try {
    const ret = await shell.openExternal(url)
    logDiagnostics(`[dbg-vog] openUrl: resolved=${JSON.stringify(ret)}`)
  } catch (err) {
    logDiagnostics(`[dbg-vog] openUrl: rejected ${String(err)}`)
    throw err
  }
  // TEMP [dbg-vog] A/B: launch through explorer.exe (ShellExecute inside the
  // Explorer process) so we can tell an Electron-shell failure apart from a
  // process-launch restriction around this app instance.
  execFile('explorer.exe', [url], (err, stdout, stderr) => {
    logDiagnostics(
      `[dbg-vog] openUrl: explorer.exe ${url} err=${err ? `${err.name} ${err.code} ${err.message}` : 'none'} out=${stdout.trim()} errout=${stderr.trim()}`
    )
  })
}

async function resolveWebRepo(repoPath: string) {
  const remote = await getRemoteUrl(repoPath)
  const repo = toWebRepository(remote)
  // TEMP [dbg-vog] while chasing "View on GitHub does nothing".
  logDiagnostics(
    `[dbg-vog] resolveWebRepo: repoPath=${repoPath} remote=${remote} webUrl=${repo?.webUrl ?? 'null'}`
  )
  if (repo === null) {
    throw new Error(
      'No browsable URL for this repository — the origin remote is missing or not an http/ssh URL.'
    )
  }
  return repo
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
    return saveSettings(patch)
  },
  async selectDirectory() {
    const parent = getMainWindow() ?? undefined
    const result = await dialog.showOpenDialog(parent!, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  },
  async testAiConnection() {
    const cfg = await getAiConfig()
    return testConnection(cfg.baseUrl, cfg.apiKey ?? '', cfg.model)
  },
  async suggestCloneFolder(url: string) {
    return suggestedCloneDirectory(url)
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
  async addToGitignore(repoPath: string, path: string) {
    const target = safeJoin(repoPath, path)
    let isDirectory = false
    try {
      isDirectory = statSync(target).isDirectory()
    } catch {
      isDirectory = false
    }
    const rule = gitignoreRuleFor(path, isDirectory)
    const changed = await appendGitignoreRule(repoPath, rule)
    if (!changed) return
    // Ignoring a file that git already tracks needs an untrack too, otherwise
    // the list looks unchanged; keep it explicit for the user.
    const status = await getStatus(repoPath)
    if (status.files.some(f => f.path === path)) {
      throw new Error(
        `${path} is already tracked. Discard or unstage it first, then ignore it again.`
      )
    }
  },

  async getPathDiff(repoPath: string, path: string, oldPath?: string) {
    return getPathDiff(repoPath, path, oldPath)
  },
  async getCommitFileDiff(repoPath: string, sha: string, path: string) {
    return getCommitFileDiff(repoPath, sha, path)
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
    paths: ReadonlyArray<string>
  ) {
    return commitPaths(repoPath, summary, description, paths)
  },
  async amendCommit(
    repoPath: string,
    summary: string,
    description: string,
    paths: ReadonlyArray<string>
  ) {
    return amendCommit(repoPath, summary, description, paths)
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
    // TEMP diagnostics while chasing "Show in Explorer does nothing".
    logDiagnostics(
      `revealInFolder: repoPath=${repoPath} path=${path} target=${target} isDir=${statSync(target).isDirectory()}`
    )
    shell.showItemInFolder(target)
    logDiagnostics('revealInFolder: showItemInFolder returned')
  },
  async openFile(repoPath: string, path: string) {
    const target = safeJoin(repoPath, path)
    if (!existsSync(target)) {
      throw new Error(`${path} does not exist on disk any more.`)
    }
    const failure = await shell.openPath(target)
    // TEMP diagnostics while chasing "Show in Explorer does nothing".
    logDiagnostics(`openFile: target=${target} openPathResult=${failure || 'ok'}`)
    if (failure.length > 0) {
      throw new Error(`Could not open ${path}: ${failure}`)
    }
  },
  async openExternal(url: string) {
    await openUrl(url)
  },
  async writeClipboard(text: string) {
    clipboard.writeText(text)
  },

  async generateCommitMessage(
    repoPath: string,
    paths: ReadonlyArray<string>
  ) {
    const cfg = await getAiConfig()
    if (cfg.apiKey === null || cfg.apiKey.length === 0) {
      throw new Error(
        'No API key configured. Open Preferences → AI commit agent and add one.'
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
  }
}

export function registerIpc(): void {
  for (const channel of Object.keys(handlers) as RequestResponseChannel[]) {
    ipcMain.handle(
      channel,
      async (event, ...args): Promise<IpcResult<unknown>> => {
        if (!isTrustedSender(event.sender.id)) {
          // TEMP [dbg-vog] while chasing "View on GitHub does nothing".
          logDiagnostics(
            `[dbg-vog] IPC rejected (untrusted sender id=${event.sender.id}) for ${channel}`
          )
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
