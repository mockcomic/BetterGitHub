import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import { posix as pathPosix, win32 as pathWin32 } from 'path'
import { spawn } from 'child_process'
import {
  detectExternalApps,
  findCommand,
  getDetectedApps,
  LINUX_FILE_MANAGERS,
  openDetected,
  resetDetectedAppsCache,
  shimTargetExe,
  type CommandRules,
  type DetectedApp,
  type DetectDeps,
  type LaunchSpec
} from '../src/main/external-apps'

vi.mock('child_process', () => ({ spawn: vi.fn() }))

/**
 * Detection is pure over injected probes: commands resolve from a fixed
 * table, paths from a set. The electron-bound launcher and the PATH walker
 * against a real disk are exercised by hand; everything that decides *what
 * the dropdown may show* is here.
 */

function stubDeps(options: {
  commands?: Readonly<Record<string, string>>
  existingPaths?: ReadonlyArray<string>
  contents?: Readonly<Record<string, string>>
  env?: NodeJS.ProcessEnv
  home?: string
}): DetectDeps {
  const commands = options.commands ?? {}
  const existing = new Set(options.existingPaths ?? [])
  const contents = options.contents ?? {}
  return {
    env: options.env ?? {},
    home: options.home ?? '/home/tester',
    resolveCommand: async command => {
      const hit = commands[command]
      return hit !== undefined ? hit : null
    },
    exists: async path => existing.has(path),
    readText: async path => contents[path] ?? null
  }
}

function app(detected: DetectedApp): string {
  return detected.app.id
}

/** Where a launch spec actually points, for the real-machine log line. */
function launchTarget(launch: LaunchSpec): string {
  if (launch.kind === 'exec') return launch.command
  if (launch.kind === 'cmdShim') return launch.shim
  if (launch.kind === 'macOpen') return launch.appName
  return launch.kind
}

describe('detectExternalApps — win32', () => {
  it('always offers Explorer and never an undetected editor', async () => {
    const apps = await detectExternalApps(
      stubDeps({ commands: { code: 'C:\\tools\\bin\\code.cmd' } }),
      'win32'
    )
    expect(apps.map(app)).toEqual(['files', 'code'])
    expect(apps[0].app.label).toBe('Windows Explorer')
    expect(apps[0].launch).toEqual({ kind: 'explorer' })
  })

  it('routes a .cmd shim through cmd.exe and a raw exe directly', async () => {
    const apps = await detectExternalApps(
      stubDeps({ commands: { code: 'C:\\x\\code.cmd', zed: 'C:\\x\\zed.exe' } }),
      'win32'
    )
    const code = apps.find(a => a.app.id === 'code')
    const zed = apps.find(a => a.app.id === 'zed')
    expect(code?.launch).toEqual({ kind: 'cmdShim', shim: 'C:\\x\\code.cmd' })
    expect(zed?.launch).toEqual({ kind: 'exec', command: 'C:\\x\\zed.exe' })
  })

  it('falls back to known install layouts when PATH has no shim', async () => {
    const apps = await detectExternalApps(
      stubDeps({
        env: { LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' },
        home: 'C:\\Users\\t',
        existingPaths: ['C:\\Users\\t\\AppData\\Local\\Programs\\cursor\\Cursor.exe']
      }),
      'win32'
    )
    const cursor = apps.find(a => a.app.id === 'cursor')
    expect(cursor?.launch).toEqual({
      kind: 'exec',
      command: 'C:\\Users\\t\\AppData\\Local\\Programs\\cursor\\Cursor.exe'
    })
  })

  it('sorts detected editors by label', async () => {
    const apps = await detectExternalApps(
      stubDeps({
        commands: { code: 'C:\\x\\code.cmd', cursor: 'C:\\x\\cursor.cmd', webstorm: 'C:\\x\\w.exe' }
      }),
      'win32'
    )
    const labels = apps.filter(a => a.app.kind === 'editor').map(a => a.app.label)
    expect(labels).toEqual(['Cursor', 'Visual Studio Code', 'WebStorm'])
  })
})

/**
 * A fork's compatibility shim on PATH must not make a foreign row detected
 * with a launcher that runs the fork: Cursor ships `codeBin\code.cmd`
 * (invoking Cursor.exe) on PATH ahead of real VS Code's bin, and the
 * "Visual Studio Code" row opened Cursor. The gate rejects the hit, so the
 * row either falls through to VS Code's own install layout or disappears.
 */
describe('detectExternalApps — win32 PATH-shim attribution', () => {
  const CURSOR_CODE_SHIM =
    'C:\\Users\\t\\AppData\\Local\\Programs\\cursor\\resources\\app\\codeBin\\code.cmd'
  const VSCODE_CMD =
    'C:\\Users\\t\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd'
  const CURSOR_CODE_SHIM_TEXT =
    '@echo off\r\nsetlocal\r\nset VSCODE_DEV=\r\nset ELECTRON_RUN_AS_NODE=1\r\n' +
    '"%~dp0..\\..\\..\\Cursor.exe" "%~dp0..\\out\\cli.js" %*\r\nendlocal\r\n'
  const VSCODE_CMD_TEXT =
    '@echo off\r\nsetlocal\r\n"%~dp0..\\Code.exe" "%~dp0..\\resources\\app\\out\\cli.js" %*\r\nendlocal\r\n'
  const env = { LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' }
  const cursorCmd = 'C:\\x\\cursor.cmd'
  const cursorCmdText = '"%~dp0..\\Cursor.exe" "%~dp0..\\out\\cli.js" %*\r\n'

  it('a foreign code.cmd falls through to the real VS Code install layout', async () => {
    const apps = await detectExternalApps(
      stubDeps({
        env,
        home: 'C:\\Users\\t',
        commands: { code: CURSOR_CODE_SHIM, cursor: cursorCmd },
        existingPaths: [VSCODE_CMD],
        contents: {
          [CURSOR_CODE_SHIM]: CURSOR_CODE_SHIM_TEXT,
          [cursorCmd]: cursorCmdText
        }
      }),
      'win32'
    )
    expect(apps.find(a => a.app.id === 'code')?.launch).toEqual({ kind: 'cmdShim', shim: VSCODE_CMD })
    // The cursor row keeps its own (correctly attributed) shim.
    expect(apps.find(a => a.app.id === 'cursor')?.launch).toEqual({ kind: 'cmdShim', shim: cursorCmd })
  })

  it('a foreign code.cmd with no real VS Code install shows no VS Code row at all', async () => {
    const apps = await detectExternalApps(
      stubDeps({
        env,
        home: 'C:\\Users\\t',
        commands: { code: CURSOR_CODE_SHIM, cursor: cursorCmd },
        contents: { [CURSOR_CODE_SHIM]: CURSOR_CODE_SHIM_TEXT, [cursorCmd]: cursorCmdText }
      }),
      'win32'
    )
    expect(apps.map(a => a.app.id)).toEqual(['files', 'cursor'])
  })

  it("a row's own shim passes the gate", async () => {
    const apps = await detectExternalApps(
      stubDeps({ env, commands: { code: VSCODE_CMD }, contents: { [VSCODE_CMD]: VSCODE_CMD_TEXT } }),
      'win32'
    )
    expect(apps.find(a => a.app.id === 'code')?.launch).toEqual({ kind: 'cmdShim', shim: VSCODE_CMD })
  })

  it('an unparsable shim is accepted — the gate rejects only on evidence', async () => {
    const zedCmd = 'C:\\x\\zed.cmd'
    const apps = await detectExternalApps(
      stubDeps({ env, commands: { zed: zedCmd }, contents: { [zedCmd]: 'start "" "%ZED%\\zed.exe" %*\r\n' } }),
      'win32'
    )
    expect(apps.find(a => a.app.id === 'zed')?.launch).toEqual({ kind: 'cmdShim', shim: zedCmd })
  })

  it('checks a direct .exe PATH hit by its own file name', async () => {
    const foreign = await detectExternalApps(stubDeps({ env, commands: { code: 'C:\\x\\Cursor.exe' } }), 'win32')
    expect(foreign.map(a => a.app.id)).toEqual(['files'])

    const own = await detectExternalApps(stubDeps({ env, commands: { code: 'C:\\x\\Code.exe' } }), 'win32')
    expect(own.find(a => a.app.id === 'code')?.launch).toEqual({ kind: 'exec', command: 'C:\\x\\Code.exe' })
  })

  it('does not gate POSIX hits, where no shim text format is promised', async () => {
    const apps = await detectExternalApps(
      stubDeps({ commands: { code: '/usr/bin/code' } }),
      'linux'
    )
    expect(apps.find(a => a.app.id === 'code')?.launch).toEqual({ kind: 'exec', command: '/usr/bin/code' })
  })
})

describe('shimTargetExe', () => {
  it('resolves a %~dp0-relative invocation against the shim directory', () => {
    const target = shimTargetExe(
      'C:\\p\\cursor\\resources\\app\\codeBin\\code.cmd',
      '"%~dp0..\\..\\..\\Cursor.exe" "%~dp0..\\out\\cli.js" %*'
    )
    expect(target).toBe('C:\\p\\cursor\\Cursor.exe')
  })

  it('skips quoted non-exe tokens and takes the first .exe', () => {
    const target = shimTargetExe(
      'C:\\p\\Microsoft VS Code\\bin\\code.cmd',
      '"%~dp0..\\out\\cli.js" "%~dp0..\\Code.exe" %*'
    )
    expect(target).toBe('C:\\p\\Microsoft VS Code\\Code.exe')
  })

  it('returns null for unreadable text and for tokens it cannot expand', () => {
    expect(shimTargetExe('C:\\x\\a.cmd', null)).toBeNull()
    expect(shimTargetExe('C:\\x\\a.cmd', '@echo off\r\n')).toBeNull()
    expect(shimTargetExe('C:\\x\\a.cmd', '"%TOOL%\\a.exe" %*')).toBeNull()
  })
})

describe('detectExternalApps — darwin', () => {
  it('always offers the Finder and prefers a bundle over a CLI shim', async () => {
    // Bundle paths follow the *probed* platform (posix), never the host's —
    // macAppBundle builds them with pathPosix, like the findCommand note.
    const bundle = pathPosix.join('/Applications', 'Zed.app')
    const apps = await detectExternalApps(
      stubDeps({
        commands: { zed: '/usr/local/bin/zed' },
        existingPaths: [bundle]
      }),
      'darwin'
    )
    expect(apps.map(app)).toEqual(['files', 'zed'])
    expect(apps[0].app.label).toBe('Finder')
    expect(apps[0].launch).toEqual({ kind: 'macFolder' })
    // The bundle wins even though the CLI also resolves.
    expect(apps[1].launch).toEqual({ kind: 'macOpen', appName: bundle })
  })

  it('falls back to the CLI when no bundle is on disk', async () => {
    const apps = await detectExternalApps(
      stubDeps({ commands: { code: '/usr/local/bin/code' } }),
      'darwin'
    )
    expect(apps.find(a => a.app.id === 'code')?.launch).toEqual({
      kind: 'exec',
      command: '/usr/local/bin/code'
    })
  })

  it('honours a user-scope ~/Applications install', async () => {
    const bundle = pathPosix.join('/Users/t', 'Applications', 'Cursor.app')
    const apps = await detectExternalApps(
      stubDeps({
        home: '/Users/t',
        existingPaths: [bundle]
      }),
      'darwin'
    )
    expect(apps.find(a => a.app.id === 'cursor')?.launch).toEqual({
      kind: 'macOpen',
      appName: bundle
    })
  })
})

describe('detectExternalApps — linux', () => {
  it('lists every named file manager under its own id', async () => {
    const apps = await detectExternalApps(
      stubDeps({ commands: { nautilus: '/usr/bin/nautilus', dolphin: '/usr/bin/dolphin', code: '/usr/bin/code' } }),
      'linux'
    )
    expect(apps.map(a => [a.app.id, a.app.label])).toEqual([
      ['files-nautilus', 'Files (Nautilus)'],
      ['files-dolphin', 'Dolphin'],
      ['code', 'Visual Studio Code']
    ])
    expect(apps[0].launch).toEqual({ kind: 'exec', command: '/usr/bin/nautilus' })
  })

  it('falls back to xdg-open only when no named manager answers', async () => {
    const apps = await detectExternalApps(
      stubDeps({ commands: { 'xdg-open': '/usr/bin/xdg-open', nautilus: '/usr/bin/nautilus' } }),
      'linux'
    )
    expect(apps.map(app)).toEqual(['files-nautilus'])

    const only = await detectExternalApps(stubDeps({ commands: { 'xdg-open': '/usr/bin/xdg-open' } }), 'linux')
    expect(only.map(app)).toEqual(['files'])
    expect(only[0].app.label).toBe('System File Manager')
  })

  it('can show no file manager at all — but never a dead row', async () => {
    const apps = await detectExternalApps(stubDeps({ commands: { subl: '/usr/bin/subl' } }), 'linux')
    expect(apps.map(app)).toEqual(['sublime'])
    expect(apps.every(a => a.app.kind === 'editor')).toBe(true)
  })

  it('ids are unique across the whole result', async () => {
    const commands: Record<string, string> = { nautilus: '/a/nautilus', dolphin: '/a/dolphin' }
    for (const fm of LINUX_FILE_MANAGERS) commands[fm.command] = `/a/${fm.command}`
    const apps = await detectExternalApps(
      stubDeps({ commands: { ...commands, code: '/a/code', cursor: '/a/cursor' } }),
      'linux'
    )
    const ids = apps.map(a => a.app.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('openDetected — cmdShim launch', () => {
  const spawnMock = vi.mocked(spawn)

  /** A child that "spawns" on the next microtask, like a real detached helper. */
  function fakeChild(): EventEmitter {
    const child = new EventEmitter() as EventEmitter & { unref(): void }
    child.unref = () => undefined
    queueMicrotask(() => child.emit('spawn'))
    return child
  }

  afterEach(() => spawnMock.mockReset())

  it('sends cmd a command line that survives a shim path with spaces', async () => {
    spawnMock.mockReturnValueOnce(fakeChild() as never)
    await openDetected(
      {
        app: { id: 'code', label: 'Visual Studio Code', kind: 'editor' },
        launch: {
          kind: 'cmdShim',
          shim: 'C:\\Users\\t\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd'
        }
      },
      'C:\\Users\\t\\My Repo'
    )
    // cmd's /s rule strips the first and last quote after /c, so the whole
    // command is wrapped once more with each part quoted; verbatim args stop
    // Node from escaping those quotes away.
    expect(spawnMock).toHaveBeenCalledWith(
      'cmd.exe',
      [
        '/d',
        '/s',
        '/c',
        '""C:\\Users\\t\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd" "C:\\Users\\t\\My Repo""'
      ],
      expect.objectContaining({ detached: true, windowsVerbatimArguments: true })
    )
  })

  it('launches exec specs directly, with Node quoting the path', async () => {
    spawnMock.mockReturnValueOnce(fakeChild() as never)
    await openDetected(
      {
        app: { id: 'zed', label: 'Zed', kind: 'editor' },
        launch: { kind: 'exec', command: 'C:\\x\\zed.exe' }
      },
      'C:\\x\\repo'
    )
    expect(spawnMock).toHaveBeenCalledWith(
      'C:\\x\\zed.exe',
      ['C:\\x\\repo'],
      expect.not.objectContaining({ windowsVerbatimArguments: true })
    )
  })
})

describe('findCommand', () => {
  /** Candidate paths follow the *rules'* platform, never the host's: the
   *  walker joins win32 rules with win32 semantics and POSIX rules with
   *  POSIX, so these expectations hold on every host. */
  const j = (...segments: string[]): string => pathPosix.join(...segments)
  const jw = (...segments: string[]): string => pathWin32.join(...segments)
  const pathVar = (...dirs: string[]): string => dirs.join(':')

  const posix = (files: ReadonlySet<string>, exec: ReadonlySet<string>, path: string): CommandRules => ({
    platform: 'linux',
    env: { PATH: path },
    isFile: async p => files.has(p),
    isExecutable: async p => exec.has(p)
  })

  it('walks PATH in order, then extraDirs, first hit wins', async () => {
    const rules = posix(
      new Set([j('/a', 'tool'), j('/c', 'tool')]),
      new Set([j('/a', 'tool'), j('/c', 'tool')]),
      pathVar('/a', '/b')
    )
    expect(await findCommand('tool', ['/c'], rules)).toBe(j('/a', 'tool'))
    expect(await findCommand('tool', ['/a', '/c'], rules)).toBe(j('/a', 'tool'))
  })

  it('finds a command that only lives in an extra dir', async () => {
    const rules = posix(new Set([j('/c', 'tool')]), new Set([j('/c', 'tool')]), pathVar('/a', '/b'))
    expect(await findCommand('tool', ['/c'], rules)).toBe(j('/c', 'tool'))
  })

  it('refuses a POSIX file without the executable bit', async () => {
    const rules = posix(new Set([j('/a', 'git')]), new Set(), pathVar('/a'))
    expect(await findCommand('git', [], rules)).toBeNull()
  })

  it('returns null for a missing command', async () => {
    const rules = posix(new Set(), new Set(), pathVar('/a'))
    expect(await findCommand('nope', [], rules)).toBeNull()
  })

  const win = (files: ReadonlySet<string>, pathext = '.COM;.EXE;.BAT;.CMD'): CommandRules => ({
    platform: 'win32',
    env: { PATH: 'C:\\bin', PATHEXT: pathext },
    isFile: async p => files.has(p),
    isExecutable: async () => true
  })

  it('skips the unspawnable extensionless shim and takes the .cmd', async () => {
    // VS Code's bin ships `code`, `code.cmd` and `Code.exe`; only the
    // extensionless file on disk must not count as the command.
    const rules = win(new Set([jw('C:\\bin', 'code'), jw('C:\\bin', 'code.cmd')]))
    expect(await findCommand('code', [], rules)).toBe(jw('C:\\bin', 'code.cmd'))
  })

  it('honours PATHEXT order (.exe before .cmd when the env says so)', async () => {
    const rules = win(new Set([jw('C:\\bin', 'code.cmd'), jw('C:\\bin', 'code.exe')]), '.EXE;.CMD')
    expect(await findCommand('code', [], rules)).toBe(jw('C:\\bin', 'code.exe'))
  })

  it('matches an already-extensioned command exactly', async () => {
    const rules = win(new Set([jw('C:\\bin', 'Code.exe')]))
    expect(await findCommand('Code.exe', [], rules)).toBe(jw('C:\\bin', 'Code.exe'))
  })

  it('reads the Path (mixed-case) variable Windows uses', async () => {
    const rules: CommandRules = {
      platform: 'win32',
      env: { Path: 'C:\\bin', PATHEXT: '.CMD' },
      isFile: async p => p === jw('C:\\bin', 'cursor.cmd'),
      isExecutable: async () => true
    }
    expect(await findCommand('cursor', [], rules)).toBe(jw('C:\\bin', 'cursor.cmd'))
  })

  it('treats an empty PATH as no directories', async () => {
    const rules = posix(new Set([j('/c', 'tool')]), new Set([j('/c', 'tool')]), '')
    expect(await findCommand('tool', ['/c'], rules)).toBe(j('/c', 'tool'))
  })
})

describe('real-machine detection', () => {
  // The same code path the IPC handler runs, against this machine's actual
  // PATH and disk. Which editors answer is machine-specific by design, so
  // only invariants are asserted: unique ids, well-formed rows, and a file
  // manager whenever the platform guarantees one.
  it('returns a well-formed list (and a file manager on win/mac)', async () => {
    resetDetectedAppsCache()
    const apps = await getDetectedApps(true)
    console.log(
      'detected open-in targets:',
      apps.map(a => `${a.app.id} (${a.app.label}) -> ${launchTarget(a.launch)}`).join('\n  ') || 'none'
    )
    const ids = apps.map(a => a.app.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of apps) {
      expect(['files', 'editor']).toContain(a.app.kind)
      expect(a.app.label.length).toBeGreaterThan(0)
    }
    if (process.platform === 'win32' || process.platform === 'darwin') {
      expect(ids).toContain('files')
    }
  })
})
