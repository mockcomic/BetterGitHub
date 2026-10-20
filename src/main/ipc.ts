import { dialog, ipcMain } from 'electron'
import type { IpcResult } from '../shared/models'
import type {
  RequestResponseChannel,
  RequestResponseChannels
} from '../shared/ipc'
import { friendlyGitError } from './git/exec'
import { getStatus } from './git/status'
import { getCommitFileDiff, getCommitFileNames, getPathsDiffText, getPathDiff } from './git/diff'
import { checkoutBranch, createBranch, getBranches } from './git/branches'
import { commitPaths } from './git/commit'
import { discardPaths, stagePaths, unstagePaths } from './git/staging'
import { getLog } from './git/log'
import {
  cloneRepository,
  fetch,
  getConfigInfo,
  getRemoteUrl,
  pull,
  push,
  verifyRepository
} from './git/sync'
import {
  addRepository,
  getAiConfig,
  getPublicSettings,
  listRepositories,
  removeRepository,
  saveSettings
} from './settings'
import { generateCommitMessage, testConnection } from './ai/commit-agent'
import { getMainWindow, isTrustedSender } from './windows'

type Handlers = {
  [K in RequestResponseChannel]: (
    ...args: Parameters<RequestResponseChannels[K]>
  ) => Promise<Awaited<ReturnType<RequestResponseChannels[K]>>>
}

const generationControllers = new Map<string, AbortController>()

const handlers: Handlers = {
  async listRepositories() {
    return listRepositories()
  },
  async addRepository(path: string) {
    await verifyRepository(path)
    return addRepository(path)
  },
  async removeRepository(id: string) {
    await removeRepository(id)
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

  async getBranches(repoPath: string) {
    return getBranches(repoPath)
  },
  async checkoutBranch(repoPath: string, name: string) {
    await checkoutBranch(repoPath, name)
  },
  async createBranch(repoPath: string, name: string) {
    await createBranch(repoPath, name)
  },

  async getLog(repoPath: string, maxCount?: number) {
    return getLog(repoPath, maxCount)
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
  async getConfigInfo(repoPath: string) {
    return getConfigInfo(repoPath)
  },
  async cloneRepository(url: string, destinationPath: string) {
    const output = await cloneRepository(url, destinationPath)
    const path = destinationPath
    await addRepository(path)
    return output.length > 0 ? output : `Cloned ${url} into ${path}`
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
