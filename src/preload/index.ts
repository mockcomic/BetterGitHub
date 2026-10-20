import { contextBridge, ipcRenderer } from 'electron'
import type { RequestResponseChannel } from '../shared/ipc'
import {
  MENU_ACTION_CHANNEL,
  REPO_CHANGED_CHANNEL,
  type MenuAction
} from '../shared/ipc'

/**
 * The only surface exposed to the renderer. The renderer-side wrapper in
 * `src/renderer/src/api.ts` restores the types from the shared
 * RequestResponseChannels map and unwraps the {ok,data|error} envelope.
 */
const api = {
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
  }
}

contextBridge.exposeInMainWorld('gitdesk', api)

export type GitdeskApi = typeof api
