import type { IpcResult } from '../../shared/models'
import type {
  MenuAction,
  RequestResponseChannel,
  RequestResponseChannels
} from '../../shared/ipc'

declare global {
  interface Window {
    gitdesk: {
      invoke(
        channel: RequestResponseChannel,
        ...args: ReadonlyArray<unknown>
      ): Promise<unknown>
      onMenuAction(callback: (action: MenuAction) => void): () => void
      onRepoChanged(callback: (repoPath: string) => void): () => void
    }
  }
}

/** Typed call helper: unwraps the {ok,data|error} envelope from main. */
export async function call<K extends RequestResponseChannel>(
  channel: K,
  ...args: Parameters<RequestResponseChannels[K]>
): Promise<Awaited<ReturnType<RequestResponseChannels[K]>>> {
  const result = (await window.gitdesk.invoke(
    channel,
    ...args
  )) as IpcResult<Awaited<ReturnType<RequestResponseChannels[K]>>>
  if (result === null || result === undefined) {
    throw new Error(`No response from ${channel}`)
  }
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.data
}

export function onMenuAction(callback: (action: MenuAction) => void): () => void {
  return window.gitdesk.onMenuAction(callback)
}

export function onRepoChanged(
  callback: (repoPath: string) => void
): () => void {
  return window.gitdesk.onRepoChanged(callback)
}
