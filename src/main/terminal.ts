import { randomUUID } from 'crypto'
import { constants as fsConstants } from 'fs'
import { access, stat } from 'fs/promises'
import { join } from 'path'
import type { TerminalSessionInfo } from '../shared/models'
import { TERMINAL_EXIT_CHANNEL, TERMINAL_OUTPUT_CHANNEL } from '../shared/ipc'
import { findCommand, type CommandRules, type ExternalPlatform } from './external-apps'
import { verifyRepository } from './git/sync'
import { getMainWindow } from './windows'

/**
 * The integrated terminal: one interactive PTY session per open panel,
 * running the platform-priority shell with the repository root as working
 * directory. The architecture is node-pty in main + xterm.js in the
 * renderer, connected over the two push channels declared in
 * src/shared/ipc.ts — the same shape as node-pty's own Electron example.
 *
 * Like src/main/external-apps.ts, the interesting logic is pure over
 * injected probes ({@link ShellDeps}) and a {@link PtyHost} seam, so the
 * whole module is unit-testable without a real terminal or Electron; the
 * bottom of the file is the surface src/main/ipc.ts wires to IPC.
 */

// ------------------------------------------------------------ shell choice

/** Probes {@link selectShell} needs; tests stub all three. */
export interface ShellDeps {
  readonly platform: ExternalPlatform
  readonly env: NodeJS.ProcessEnv
  /** PATH (+ PATHEXT on win32) lookup — the external-apps catalogue rules. */
  readonly resolveCommand: (command: string) => Promise<string | null>
  /** Absolute-path existence probe (file or anything). */
  readonly exists: (path: string) => Promise<boolean>
}

/** What the panel shows in its title and what gets spawned. */
export interface ChosenShell {
  readonly file: string
  readonly label: string
}

/** The Windows PowerShell v1.0 directory under %SystemRoot%. */
const WIN_POWERSHELL_FALLBACK = (env: NodeJS.ProcessEnv): string =>
  join(env.SystemRoot ?? 'C:\\WINDOWS', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

/**
 * The platform-priority shell, resolved without spawning anything:
 * win32 prefers PowerShell 7 (`pwsh`), falls back to `powershell`, to the
 * System32 copy, and finally to %ComSpec% (cmd). macOS and Linux honour
 * $SHELL when it points at an existing file, then the conventional fallbacks
 * (zsh first on macOS, bash first on Linux, sh last everywhere). The last
 * candidate is unconditional, so there is always *a* shell.
 */
export async function selectShell(deps: ShellDeps): Promise<ChosenShell> {
  if (deps.platform === 'win32') {
    const pwsh = await deps.resolveCommand('pwsh')
    if (pwsh !== null) return { file: pwsh, label: 'PowerShell 7' }
    const powershell = await deps.resolveCommand('powershell')
    if (powershell !== null) return { file: powershell, label: 'Windows PowerShell' }
    const fallback = WIN_POWERSHELL_FALLBACK(deps.env)
    if (await deps.exists(fallback)) return { file: fallback, label: 'Windows PowerShell' }
    return { file: deps.env.ComSpec ?? 'cmd.exe', label: 'Command Prompt' }
  }
  const ordered: ReadonlyArray<string> =
    deps.platform === 'darwin' ? ['/bin/zsh', '/bin/bash', '/bin/sh'] : ['/bin/bash', '/bin/sh']
  const userShell = deps.env.SHELL
  if (userShell !== undefined && userShell.length > 0 && (await deps.exists(userShell))) {
    return { file: userShell, label: userShell.slice(userShell.lastIndexOf('/') + 1) }
  }
  for (const path of ordered.slice(0, -1)) {
    if (await deps.exists(path)) {
      return { file: path, label: path.slice(path.lastIndexOf('/') + 1) }
    }
  }
  const last = ordered[ordered.length - 1]
  return { file: last, label: last.slice(last.lastIndexOf('/') + 1) }
}

// --------------------------------------------------------------- PTY seam

/** One live pseudo-terminal, as the session manager consumes it. */
export interface PtyProcess {
  readonly onData: (callback: (data: string) => void) => void
  readonly onExit: (callback: (exitCode: number) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

/** The spawn entry point — real node-pty in production, a fake in tests. */
export interface PtyHost {
  spawn(options: {
    readonly file: string
    readonly cwd: string
    readonly env: Readonly<Record<string, string>>
    readonly cols: number
    readonly rows: number
  }): PtyProcess
}

/** The node-pty wrapper. ConPTY (Win10+) and forkpty are its own business. */
function nodePtyHost(): PtyHost {
  // Required lazily so importing this module (tests!) never touches the
  // native binding, and a broken install reports on first use, not at boot.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pty = require('node-pty') as typeof import('node-pty')
  return {
    spawn: ({ file, cwd, env, cols, rows }) => {
      const proc = pty.spawn(file, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: env as Record<string, string>
      })
      return {
        onData: callback => proc.onData(callback),
        onExit: callback => proc.onExit(e => callback(e.exitCode)),
        write: data => proc.write(data),
        resize: (nextCols, nextRows) => proc.resize(nextCols, nextRows),
        kill: () => proc.kill()
      }
    }
  }
}

// ---------------------------------------------------------- the manager

/** One env entry above the inherited one; the marker lets prompts opt in. */
const TERMINAL_ENV: Readonly<Record<string, string>> = {
  TERM: 'xterm-256color',
  GITDESK_TERMINAL: '1'
}

/** A single renderer write cannot exceed this (a paste of a huge file). */
const MAX_WRITE_BYTES = 256 * 1024

interface LiveSession {
  readonly proc: PtyProcess
}

export class TerminalManager {
  private readonly sessions = new Map<string, LiveSession>()
  private readonly host: PtyHost
  private readonly chooseShell: () => Promise<ChosenShell>

  /**
   * `send` pushes to the renderer (bound to `webContents.send` in
   * production); kept as a plain function so tests capture the pushes.
   */
  constructor(
    host: PtyHost,
    private readonly send: (channel: string, id: string, payload: string | number) => void,
    chooseShell?: () => Promise<ChosenShell>
  ) {
    this.host = host
    this.chooseShell = chooseShell ?? (() => selectShell(nodeShellDeps()))
  }

  /** Spawns a session in an already-validated repository folder. */
  async start(repoPath: string, cols: number, rows: number): Promise<TerminalSessionInfo> {
    const shell = await this.chooseShell()
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value
    }
    const id = randomUUID()
    const proc = this.host.spawn({
      file: shell.file,
      cwd: repoPath,
      env: { ...env, ...TERMINAL_ENV },
      cols: clampSize(cols),
      rows: clampSize(rows)
    })
    this.sessions.set(id, { proc })
    proc.onData(data => {
      if (this.sessions.has(id)) this.send(TERMINAL_OUTPUT_CHANNEL, id, data)
    })
    proc.onExit(exitCode => {
      const known = this.sessions.delete(id)
      if (known) this.send(TERMINAL_EXIT_CHANNEL, id, exitCode)
    })
    return { id, shellLabel: shell.label }
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (session === undefined) return
    const safe = data.length > MAX_WRITE_BYTES ? data.slice(0, MAX_WRITE_BYTES) : data
    session.proc.write(safe)
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.proc.resize(clampSize(cols), clampSize(rows))
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (session === undefined) return
    this.sessions.delete(id)
    session.proc.kill()
  }

  /** Every live session, then the map is empty; safe to call twice. */
  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}

function clampSize(value: number): number {
  return Math.min(1000, Math.max(1, Math.round(value)))
}

// ---------------------------------------------------- ipc-facing surface

let host: PtyHost | null = null

function liveHost(): PtyHost {
  if (host === null) host = nodePtyHost()
  return host
}

/** The pushes go to whichever window is the desk — there is exactly one. */
function push(channel: string, id: string, payload: string | number): void {
  getMainWindow()?.webContents.send(channel, id, payload)
}

export const terminalManager = new TerminalManager(liveHostThunk(), push)

/** Lazy so `require('node-pty')` only happens on the first terminal use. */
function liveHostThunk(): PtyHost {
  return { spawn: options => liveHost().spawn(options) }
}

function nodeShellDeps(): ShellDeps {
  const platform: ExternalPlatform =
    process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux'
  const rules: CommandRules = {
    platform,
    env: process.env,
    isFile: async path => {
      try {
        return (await stat(path)).isFile()
      } catch {
        return false
      }
    },
    isExecutable: async path => {
      try {
        await access(path, fsConstants.X_OK)
        return true
      } catch {
        return false
      }
    }
  }
  return {
    platform,
    env: process.env,
    resolveCommand: command => findCommand(command, [], rules),
    exists: async path => {
      try {
        await stat(path)
        return true
      } catch {
        return false
      }
    }
  }
}

/**
 * The IPC entry point: validates the folder exactly like the other repo
 * verbs (a repository GitDesk knows about that still exists), then spawns.
 */
export async function terminalStart(
  repoPath: string,
  cols: number,
  rows: number
): Promise<TerminalSessionInfo> {
  await verifyRepository(repoPath)
  try {
    if (!(await stat(repoPath)).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error(`${repoPath} does not exist on disk any more.`)
  }
  return terminalManager.start(repoPath, cols, rows)
}
