import type { IpcResult, RepoScanOutcome } from '../../shared/models'
import type {
  MenuAction,
  RequestResponseChannel,
  RequestResponseChannels
} from '../../shared/ipc'

declare global {
  interface Window {
    aspen: {
      platform: string
      invoke(
        channel: RequestResponseChannel,
        ...args: ReadonlyArray<unknown>
      ): Promise<unknown>
      onMenuAction(callback: (action: MenuAction) => void): () => void
      onRepoChanged(callback: (repoPath: string) => void): () => void
      onReposChanged(
        callback: (outcome: RepoScanOutcome) => void
      ): () => void
      onTerminalOutput(
        callback: (id: string, data: string) => void
      ): () => void
      onTerminalExit(
        callback: (id: string, exitCode: number) => void
      ): () => void
    }
  }
}

/** Typed call helper: unwraps the {ok,data|error} envelope from main. */
export async function call<K extends RequestResponseChannel>(
  channel: K,
  ...args: Parameters<RequestResponseChannels[K]>
): Promise<Awaited<ReturnType<RequestResponseChannels[K]>>> {
  const result = (await window.aspen.invoke(
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
  return window.aspen.onMenuAction(callback)
}

export function onRepoChanged(
  callback: (repoPath: string) => void
): () => void {
  return window.aspen.onRepoChanged(callback)
}

export function onReposChanged(
  callback: (outcome: RepoScanOutcome) => void
): () => void {
  return window.aspen.onReposChanged(callback)
}

export function onTerminalOutput(
  callback: (id: string, data: string) => void
): () => void {
  return window.aspen.onTerminalOutput(callback)
}

export function onTerminalExit(
  callback: (id: string, exitCode: number) => void
): () => void {
  return window.aspen.onTerminalExit(callback)
}
