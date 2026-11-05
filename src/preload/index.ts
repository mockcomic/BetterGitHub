import { contextBridge, ipcRenderer } from 'electron'
import type { RequestResponseChannel } from '../shared/ipc'
import {
  MENU_ACTION_CHANNEL,
  REPO_CHANGED_CHANNEL,
  REPOS_CHANGED_CHANNEL,
  TERMINAL_EXIT_CHANNEL,
  TERMINAL_OUTPUT_CHANNEL,
  type MenuAction
} from '../shared/ipc'
import type { RepoScanOutcome } from '../shared/models'

/**
 * The only surface exposed to the renderer. The renderer-side wrapper in
 * `src/renderer/src/api.ts` restores the types from the shared
 * RequestResponseChannels map and unwraps the {ok,data|error} envelope.
 */
const api = {
  /**
   * Static platform tag. The renderer gates the Windows title band on it
   * (main enables the Window Controls Overlay on win32 only, in
   * src/main/windows.ts) — the web-exposed overlay API has no reliable
   * `enabled` property to ask.
   */
  platform: process.platform,
  invoke: (
    channel: RequestResponseChannel,
    ...args: ReadonlyArray<unknown>
  ): Promise<unknown> => ipcRenderer.invoke(channel, ...args),
  onMenuAction: (callback: (action: MenuAction) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction) =>
      callback(action)
    ipcRenderer.on(MENU_ACTION_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, listener)
    }
  },
  /** Main pushes the repository path when a watched working tree changes. */
  onRepoChanged: (callback: (repoPath: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, repoPath: string) =>
      callback(repoPath)
    ipcRenderer.on(REPO_CHANGED_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(REPO_CHANGED_CHANNEL, listener)
    }
  },
  /**
   * Main pushes the outcome when a watch-folder scan changed the repository
   * list (added/removed repos) without the renderer asking.
   */
  onReposChanged: (
    callback: (outcome: RepoScanOutcome) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      outcome: RepoScanOutcome
    ) => callback(outcome)
    ipcRenderer.on(REPOS_CHANGED_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(REPOS_CHANGED_CHANNEL, listener)
    }
  },
  /** Main pushes one PTY output chunk for a terminal session. */
  onTerminalOutput: (
    callback: (id: string, data: string) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      id: string,
      data: string
    ) => callback(id, data)
    ipcRenderer.on(TERMINAL_OUTPUT_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(TERMINAL_OUTPUT_CHANNEL, listener)
    }
  },
  /** Main pushes the exit code when a terminal session's shell quits. */
  onTerminalExit: (
    callback: (id: string, exitCode: number) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      id: string,
      exitCode: number
    ) => callback(id, exitCode)
    ipcRenderer.on(TERMINAL_EXIT_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(TERMINAL_EXIT_CHANNEL, listener)
    }
  }
}

contextBridge.exposeInMainWorld('aspen', api)

export type AspenApi = typeof api
