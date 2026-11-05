import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { PtyHost, PtyProcess, ShellDeps } from '../src/main/terminal'
import { selectShell, TerminalManager } from '../src/main/terminal'

/**
 * The terminal module keeps the interesting decisions — which shell wins,
 * and what the session map does with every event — pure over a ShellDeps
 * probe set (same spirit as external-apps.test.ts) and a PtyHost seam.
 * The node-pty host and the Electron-bound surface at the bottom of the
 * module are exercised by hand; nothing here spawns a real process.
 */

vi.mock('../src/main/windows', () => ({ getMainWindow: () => null }))
vi.mock('../src/main/git/sync', () => ({
  verifyRepository: vi.fn(async () => {})
}))

function shellDeps(options: {
  platform: 'win32' | 'darwin' | 'linux'
  commands?: Readonly<Record<string, string>>
  existingPaths?: ReadonlyArray<string>
  env?: NodeJS.ProcessEnv
}): ShellDeps {
  const commands = options.commands ?? {}
  const existing = new Set(options.existingPaths ?? [])
  return {
    platform: options.platform,
    env: options.env ?? {},
    resolveCommand: async command => commands[command] ?? null,
    exists: async path => existing.has(path)
  }
}

// ---------------------------------------------------------- fake PTY host

interface FakePty extends PtyProcess {
  fireData: (data: string) => void
  fireExit: (code: number) => void
  writes: string[]
  resizes: Array<[number, number]>
  killed: boolean
}

function fakePty(): FakePty {
  let dataCb: ((data: string) => void) | null = null
  let exitCb: ((code: number) => void) | null = null
  return {
    writes: [],
    resizes: [],
    killed: false,
    onData: cb => {
      dataCb = cb
    },
    onExit: cb => {
      exitCb = cb
    },
    write: data => {
      // The PTY echoes nothing; tests assert on `writes` directly.
    },
    resize: (cols, rows) => {
      // recorded below
    },
    kill: () => {
      // recorded below
    },
    fireData: data => dataCb?.(data),
    fireExit: code => exitCb?.(code)
  }
}

interface SpawnRecord {
  readonly file: string
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly cols: number
  readonly rows: number
}

interface RecordingHost extends PtyHost {
  readonly recorded: SpawnRecord[]
}

function fakeHost(spawned: FakePty[]): RecordingHost {
  const recorded: SpawnRecord[] = []
  return {
    recorded,
    spawn: options => {
      recorded.push(options)
      const pty = fakePty()
      pty.write = data => {
        pty.writes.push(data)
      }
      pty.resize = (cols, rows) => {
        pty.resizes.push([cols, rows])
      }
      pty.kill = () => {
        pty.killed = true
      }
      spawned.push(pty)
      return pty
    }
  }
}

function managerWith(): {
  manager: TerminalManager
  host: RecordingHost
  spawned: FakePty[]
  pushes: Array<{ channel: string; id: string; payload: string | number }>
} {
  const spawned: FakePty[] = []
  const host = fakeHost(spawned)
  const pushes: Array<{ channel: string; id: string; payload: string | number }> = []
  const manager = new TerminalManager(
    host,
    (channel, id, payload) => pushes.push({ channel, id, payload }),
    async () => ({ file: '/bin/bash', label: 'bash' })
  )
  return { manager, host, spawned, pushes }
}

// ------------------------------------------------------------ shell rules

describe('selectShell — win32', () => {
  it('prefers pwsh over powershell over the System32 copy over ComSpec', async () => {
    expect(
      await selectShell(
        shellDeps({
          platform: 'win32',
          commands: { pwsh: 'C:\\pwsh\\pwsh.exe', powershell: 'C:\\ps\\powershell.exe' }
        })
      )
    ).toEqual({ file: 'C:\\pwsh\\pwsh.exe', label: 'PowerShell 7' })

    expect(
      await selectShell(
        shellDeps({ platform: 'win32', commands: { powershell: 'C:\\ps\\powershell.exe' } })
      )
    ).toEqual({ file: 'C:\\ps\\powershell.exe', label: 'Windows PowerShell' })

    expect(
      await selectShell(
        shellDeps({
          platform: 'win32',
          env: { SystemRoot: 'C:\\WINDOWS' },
          existingPaths: ['C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe']
        })
      )
    ).toEqual({
      file: 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      label: 'Windows PowerShell'
    })

    expect(
      await selectShell(
        shellDeps({ platform: 'win32', env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' } })
      )
    ).toEqual({ file: 'C:\\Windows\\System32\\cmd.exe', label: 'Command Prompt' })
  })

  it('answers cmd.exe even with nothing detected at all', async () => {
    const shell = await selectShell(shellDeps({ platform: 'win32' }))
    expect(shell).toEqual({ file: 'cmd.exe', label: 'Command Prompt' })
  })
})

describe('selectShell — darwin', () => {
  it('honours $SHELL when it exists', async () => {
    const shell = await selectShell(
      shellDeps({
        platform: 'darwin',
        env: { SHELL: '/opt/homebrew/bin/fish' },
        existingPaths: ['/opt/homebrew/bin/fish']
      })
    )
    expect(shell).toEqual({ file: '/opt/homebrew/bin/fish', label: 'fish' })
  })

  it('skips a missing $SHELL and walks zsh, bash, sh', async () => {
    const missing = await selectShell(
      shellDeps({
        platform: 'darwin',
        env: { SHELL: '/gone/tcsh' },
        existingPaths: ['/bin/zsh']
      })
    )
    expect(missing).toEqual({ file: '/bin/zsh', label: 'zsh' })

    const noZsh = await selectShell(
      shellDeps({ platform: 'darwin', existingPaths: ['/bin/bash'] })
    )
    expect(noZsh).toEqual({ file: '/bin/bash', label: 'bash' })
  })

  it('falls back to /bin/sh when nothing else exists', async () => {
    const shell = await selectShell(shellDeps({ platform: 'darwin', existingPaths: [] }))
    expect(shell).toEqual({ file: '/bin/sh', label: 'sh' })
  })
})

describe('selectShell — linux', () => {
  it('prefers bash over sh (no zsh step) and honours $SHELL', async () => {
    const plain = await selectShell(
      shellDeps({ platform: 'linux', existingPaths: ['/bin/bash', '/bin/sh'] })
    )
    expect(plain).toEqual({ file: '/bin/bash', label: 'bash' })

    const zsh = await selectShell(
      shellDeps({
        platform: 'linux',
        env: { SHELL: '/bin/zsh' },
        existingPaths: ['/bin/zsh', '/bin/bash']
      })
    )
    expect(zsh).toEqual({ file: '/bin/zsh', label: 'zsh' })
  })

  it('ignores an empty $SHELL', async () => {
    const shell = await selectShell(
      shellDeps({ platform: 'linux', env: { SHELL: '' }, existingPaths: ['/bin/bash', '/bin/sh'] })
    )
    expect(shell).toEqual({ file: '/bin/bash', label: 'bash' })
  })
})

// --------------------------------------------------------- session manager

describe('TerminalManager', () => {
  let ctx: ReturnType<typeof managerWith>

  beforeEach(() => {
    ctx = managerWith()
  })

  it('spawns the chosen shell in the repo with the terminal env', async () => {
    const info = await ctx.manager.start('/repo', 120, 40)
    expect(info.shellLabel).toBe('bash')
    expect(info.id).toMatch(/^[0-9a-f-]{36}$/)
    const options = ctx.host.recorded[0]
    expect(options.file).toBe('/bin/bash')
    expect(options.cwd).toBe('/repo')
    expect(options.cols).toBe(120)
    expect(options.rows).toBe(40)
    expect(options.env.TERM).toBe('xterm-256color')
    expect(options.env.GITDESK_TERMINAL).toBe('1')
    // The inherited environment arrives intact (PATH is always set here).
    expect(options.env.PATH).toBe(process.env.PATH)
  })

  it('clamps absurd sizes at spawn', async () => {
    await ctx.manager.start('/repo', 0, 100_000)
    expect(ctx.host.recorded[0].cols).toBe(1)
    expect(ctx.host.recorded[0].rows).toBe(1000)
  })

  it('routes output to the session id and stops after the shell exits', async () => {
    const info = await ctx.manager.start('/repo', 80, 24)
    const pty = ctx.spawned[0]
    pty.fireData('hello')
    expect(ctx.pushes).toEqual([{ channel: 'terminal-output', id: info.id, payload: 'hello' }])
    pty.fireExit(3)
    expect(ctx.pushes).toEqual([
      { channel: 'terminal-output', id: info.id, payload: 'hello' },
      { channel: 'terminal-exit', id: info.id, payload: 3 }
    ])
    // The session is gone: later data (a trailing write race) is dropped.
    pty.fireData('late')
    expect(ctx.pushes).toHaveLength(2)
  })

  it('goes quiet when killed: the exit event no longer pushes', async () => {
    const info = await ctx.manager.start('/repo', 80, 24)
    const pty = ctx.spawned[0]
    ctx.manager.kill(info.id)
    expect(pty.killed).toBe(true)
    pty.fireExit(0)
    expect(ctx.pushes).toEqual([])
  })

  it('forwards writes and resizes, and slices oversized pastes', async () => {
    const info = await ctx.manager.start('/repo', 80, 24)
    const pty = ctx.spawned[0]
    ctx.manager.write(info.id, 'ls\r')
    expect(pty.writes).toEqual(['ls\r'])
    ctx.manager.write(info.id, 'x'.repeat(300 * 1024))
    expect(pty.writes[1]).toHaveLength(256 * 1024)
    ctx.manager.resize(info.id, 100, 30)
    expect(pty.resizes).toEqual([[100, 30]])
  })

  it('ignores unknown session ids everywhere', async () => {
    expect(() => ctx.manager.write('nope', 'x')).not.toThrow()
    expect(() => ctx.manager.resize('nope', 80, 24)).not.toThrow()
    expect(() => ctx.manager.kill('nope')).not.toThrow()
  })

  it('killAll empties every live session and survives a second call', async () => {
    const a = await ctx.manager.start('/repo', 80, 24)
    const b = await ctx.manager.start('/repo', 80, 24)
    ctx.manager.killAll()
    expect(ctx.spawned).toHaveLength(2)
    expect(ctx.spawned.every(p => p.killed)).toBe(true)
    ctx.spawned[0].fireData('after')
    expect(ctx.pushes).toEqual([])
    expect(() => ctx.manager.killAll()).not.toThrow()
    void a
    void b
  })
})

// ------------------------------------------------------- validation guard

describe('terminalStart', () => {
  beforeEach(async () => {
    vi.mocked((await import('../src/main/git/sync')).verifyRepository).mockReset().mockResolvedValue(undefined)
  })

  it('refuses a path that verifyRepository rejects', async () => {
    const { verifyRepository } = await import('../src/main/git/sync')
    vi.mocked(verifyRepository).mockRejectedValueOnce(new Error('not a git repository'))
    const { terminalStart } = await import('../src/main/terminal')
    await expect(terminalStart('/nope', 80, 24)).rejects.toThrow('not a git repository')
  })

  it('refuses a folder that is no longer on disk', async () => {
    const { terminalStart } = await import('../src/main/terminal')
    await expect(terminalStart(join(tmpdir(), 'gitdesk-terminal-missing'), 80, 24)).rejects.toThrow(
      /does not exist on disk any more/
    )
  })

  it('refuses a path that is a file, not a directory', async () => {
    const path = join(tmpdir(), `gitdesk-terminal-file-${Date.now()}.txt`)
    await writeFile(path, 'x')
    const { terminalStart } = await import('../src/main/terminal')
    await expect(terminalStart(path, 80, 24)).rejects.toThrow(
      /does not exist on disk any more/
    )
  })
})
