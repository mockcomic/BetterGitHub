import { spawn } from 'child_process'
import { constants as fsConstants } from 'fs'
import { access, stat } from 'fs/promises'
import { homedir } from 'os'
import { delimiter, extname, join } from 'path'
import type { ExternalApp } from '../shared/models'

/**
 * Runtime detection + launch of the targets behind the command strip's
 * "Open in" button: the OS file manager and the source editors actually
 * installed on this machine.
 *
 * GitHub Desktop keeps its "Open in …" editor list in settings and launches
 * whatever the user configured. GitDesk has no such setting yet, so this
 * module inverts the problem: a data-driven catalog is probed at runtime and
 * only hits are ever surfaced — a row in the dropdown can never be a dead
 * click. The core is pure over injected probes (see {@link DetectDeps}) so it
 * is unit-testable without Electron; the {@link getDetectedApps} /
 * {@link openRepoInApp} surface at the bottom is what src/main/ipc.ts wires
 * to IPC.
 */

/** The three platforms the catalog knows; everything else probes as linux. */
export type ExternalPlatform = 'win32' | 'darwin' | 'linux'

/** How one detected app gets launched with the repository root as argument. */
export type LaunchSpec =
  /** `<command> <repoPath>` — a resolved executable (POSIX) or native .exe. */
  | { readonly kind: 'exec'; readonly command: string }
  /** `cmd.exe /d /s /c <shim> <repoPath>` — a Windows .cmd/.bat CLI shim. */
  | { readonly kind: 'cmdShim'; readonly shim: string }
  /** `open -a <appName> <repoPath>` — appName is the full path to the .app. */
  | { readonly kind: 'macOpen'; readonly appName: string }
  /** `open <repoPath>` — the Finder opens the folder itself. */
  | { readonly kind: 'macFolder' }
  /** `explorer.exe <repoPath>` — the Windows shell opens the folder itself. */
  | { readonly kind: 'explorer' }

export interface DetectedApp {
  readonly app: ExternalApp
  readonly launch: LaunchSpec
}

/**
 * The injected probes. The production implementation reads PATH/real files;
 * tests stub them. All are async and never throw — absence is `null` or
 * `false`, never a rejected promise.
 */
export interface DetectDeps {
  /**
   * First executable named `command` found in PATH followed by `extraDirs`
   * (first match wins, like a shell), or null when nowhere on the list.
   */
  readonly resolveCommand: (
    command: string,
    extraDirs: ReadonlyArray<string>
  ) => Promise<string | null>
  /** True when the absolute path exists (file *or* folder — .app bundles). */
  readonly exists: (path: string) => Promise<boolean>
  readonly env: NodeJS.ProcessEnv
  readonly home: string
}

// ---------------------------------------------------------------- catalog

interface PlatformProbe {
  /** CLI names resolved through PATH (+ extraDirs); first hit wins. */
  readonly commands?: ReadonlyArray<string>
  /** Extra directories searched for `commands` beyond PATH. */
  readonly extraDirs?: (deps: DetectDeps) => ReadonlyArray<string>
  /** Absolute fallback candidates (install-dir layouts), stat-probed in order. */
  readonly paths?: (deps: DetectDeps) => ReadonlyArray<string>
  /** macOS only: `.app` bundle names checked under /Applications + ~/Applications. */
  readonly appNames?: ReadonlyArray<string>
}

interface CatalogRow {
  readonly id: string
  readonly label: string
  readonly kind: 'editor'
  readonly win32?: PlatformProbe
  readonly darwin?: PlatformProbe
  readonly linux?: PlatformProbe
}

/** User-scope and machine-scope install roots, per platform conventions. */
const WINDOWS_INSTALL_DIRS = (deps: DetectDeps): string[] => {
  const local = deps.env.LOCALAPPDATA ?? join(deps.home, 'AppData', 'Local')
  const pf = deps.env['ProgramFiles'] ?? 'C:\\Program Files'
  return [join(local, 'Programs'), join(pf)]
}

/**
 * `<install root>\<folder>\bin\<exe>` plus the root-level launcher, for both
 * install scopes — the layouts VS Code-style installers ship, so detection
 * works even when the CLI shim never made it onto PATH.
 */
const winInstallPaths = (
  folder: string,
  exes: ReadonlyArray<string>
): ((deps: DetectDeps) => string[]) => deps =>
  WINDOWS_INSTALL_DIRS(deps).flatMap(dir => [
    ...exes.map(exe => join(dir, folder, 'bin', exe)),
    join(dir, folder, `${folder}.exe`),
    ...exes.map(exe => join(dir, folder, exe))
  ])

const JETBRAINS_MAC_SCRIPTS = (deps: DetectDeps): string[] => [
  join(deps.home, 'Library', 'Application Support', 'JetBrains', 'Toolbox', 'scripts')
]

const LINUX_EXTRA_BINS = (deps: DetectDeps): string[] => [
  join(deps.home, '.local', 'bin'),
  '/usr/local/bin',
  '/snap/bin',
  '/var/lib/flatpak/exports/bin',
  join(deps.home, '.local', 'share', 'flatpak', 'exports', 'bin')
]

const MAC_EDITOR_BINS = (): string[] => ['/usr/local/bin', '/opt/homebrew/bin']

/** The single table to extend when another editor should join the dropdown. */
export const EDITOR_CATALOG: ReadonlyArray<CatalogRow> = [
  {
    id: 'code',
    label: 'Visual Studio Code',
    kind: 'editor',
    win32: {
      commands: ['code'],
      paths: winInstallPaths('Microsoft VS Code', ['Code.exe', 'code.cmd'])
    },
    darwin: { appNames: ['Visual Studio Code'], commands: ['code'], extraDirs: MAC_EDITOR_BINS },
    linux: { commands: ['code'], extraDirs: LINUX_EXTRA_BINS }
  },
  {
    id: 'code-insiders',
    label: 'Visual Studio Code Insiders',
    kind: 'editor',
    win32: {
      commands: ['code-insiders'],
      paths: winInstallPaths('Microsoft VS Code Insiders', ['Code - Insiders.exe', 'code-insiders.cmd'])
    },
    darwin: {
      appNames: ['Visual Studio Code - Insiders'],
      commands: ['code-insiders'],
      extraDirs: MAC_EDITOR_BINS
    },
    linux: { commands: ['code-insiders'], extraDirs: LINUX_EXTRA_BINS }
  },
  {
    id: 'cursor',
    label: 'Cursor',
    kind: 'editor',
    win32: { commands: ['cursor'], paths: winInstallPaths('cursor', ['Cursor.exe', 'cursor.cmd']) },
    darwin: { appNames: ['Cursor'], commands: ['cursor'], extraDirs: MAC_EDITOR_BINS },
    linux: { commands: ['cursor'], extraDirs: LINUX_EXTRA_BINS }
  },
  {
    id: 'codium',
    label: 'VSCodium',
    kind: 'editor',
    win32: { commands: ['codium'], paths: winInstallPaths('VSCodium', ['Codium.exe', 'codium.cmd']) },
    darwin: { appNames: ['VSCodium'], commands: ['codium'], extraDirs: MAC_EDITOR_BINS },
    linux: { commands: ['codium'], extraDirs: LINUX_EXTRA_BINS }
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    kind: 'editor',
    win32: {
      commands: ['windsurf'],
      paths: winInstallPaths('Windsurf', ['Windsurf.exe', 'windsurf.cmd'])
    },
    darwin: { appNames: ['Windsurf'], commands: ['windsurf'], extraDirs: MAC_EDITOR_BINS },
    linux: { commands: ['windsurf'], extraDirs: LINUX_EXTRA_BINS }
  },
  {
    id: 'zed',
    label: 'Zed',
    kind: 'editor',
    win32: { commands: ['zed'], paths: winInstallPaths('Zed', ['zed.exe']) },
    darwin: { appNames: ['Zed'], commands: ['zed'], extraDirs: MAC_EDITOR_BINS },
    linux: { commands: ['zed'], extraDirs: LINUX_EXTRA_BINS }
  },
  {
    id: 'sublime',
    label: 'Sublime Text',
    kind: 'editor',
    win32: {
      commands: ['subl', 'sublime_text'],
      paths: winInstallPaths('Sublime Text', ['subl.exe', 'sublime_text.exe'])
    },
    darwin: { appNames: ['Sublime Text'], commands: ['subl'], extraDirs: MAC_EDITOR_BINS },
    linux: { commands: ['subl', 'subl3', 'sublime_text'], extraDirs: LINUX_EXTRA_BINS }
  },
  {
    id: 'idea',
    label: 'IntelliJ IDEA',
    kind: 'editor',
    win32: { commands: ['idea', 'idea64'] },
    darwin: { appNames: ['IntelliJ IDEA'], commands: ['idea'], extraDirs: JETBRAINS_MAC_SCRIPTS },
    linux: { commands: ['idea'], extraDirs: LINUX_EXTRA_BINS }
  },
  {
    id: 'webstorm',
    label: 'WebStorm',
    kind: 'editor',
    win32: { commands: ['webstorm', 'webstorm64'] },
    darwin: { appNames: ['WebStorm'], commands: ['webstorm'], extraDirs: JETBRAINS_MAC_SCRIPTS },
    linux: { commands: ['webstorm'], extraDirs: LINUX_EXTRA_BINS }
  },
  {
    id: 'pycharm',
    label: 'PyCharm',
    kind: 'editor',
    win32: { commands: ['pycharm', 'pycharm64'] },
    darwin: { appNames: ['PyCharm'], commands: ['pycharm'], extraDirs: JETBRAINS_MAC_SCRIPTS },
    linux: { commands: ['pycharm'], extraDirs: LINUX_EXTRA_BINS }
  }
]

/**
 * Linux has no guaranteed file manager, so each common one becomes its own
 * row (own id — the click must launch *that* binary, not the first match),
 * and the xdg-open default is the fallback row when nothing named answers.
 */
export const LINUX_FILE_MANAGERS: ReadonlyArray<{
  readonly command: string
  readonly id: string
  readonly label: string
}> = [
  { command: 'nautilus', id: 'files-nautilus', label: 'Files (Nautilus)' },
  { command: 'dolphin', id: 'files-dolphin', label: 'Dolphin' },
  { command: 'thunar', id: 'files-thunar', label: 'Thunar' },
  { command: 'nemo', id: 'files-nemo', label: 'Nemo' },
  { command: 'caja', id: 'files-caja', label: 'Caja' }
]

// ------------------------------------------------------------- detection

function macAppBundle(name: string, deps: DetectDeps): string[] {
  return [
    join('/Applications', `${name}.app`),
    join(deps.home, 'Applications', `${name}.app`)
  ]
}

async function probeEditor(
  row: CatalogRow,
  platform: ExternalPlatform,
  deps: DetectDeps
): Promise<DetectedApp | null> {
  const probe: PlatformProbe | undefined =
    platform === 'win32' ? row.win32 : platform === 'darwin' ? row.darwin : row.linux
  if (probe === undefined) return null

  const extraDirs = probe.extraDirs?.(deps) ?? []
  const app: ExternalApp = { id: row.id, label: row.label, kind: 'editor' }

  // macOS: a bundle on disk beats a CLI shim — `open -a` is the canonical
  // launch and survives an editor that has no terminal command installed.
  for (const name of probe.appNames ?? []) {
    for (const bundle of macAppBundle(name, deps)) {
      if (await deps.exists(bundle)) {
        return { app, launch: { kind: 'macOpen', appName: bundle } }
      }
    }
  }

  for (const command of probe.commands ?? []) {
    const resolved = await deps.resolveCommand(command, extraDirs)
    if (resolved !== null) {
      return { app, launch: winLaunch(platform, resolved) }
    }
  }

  for (const path of probe.paths?.(deps) ?? []) {
    if (await deps.exists(path)) {
      return { app, launch: winLaunch(platform, path) }
    }
  }
  return null
}

/** Windows .cmd shims must go through cmd.exe; everything else execs directly. */
function winLaunch(
  platform: ExternalPlatform,
  resolved: string
): LaunchSpec {
  if (platform === 'win32' && isWindowsShim(resolved)) {
    return { kind: 'cmdShim', shim: resolved }
  }
  return { kind: 'exec', command: resolved }
}

function isWindowsShim(path: string): boolean {
  const ext = extname(path).toLowerCase()
  return ext === '.cmd' || ext === '.bat'
}

function platformFileManagerRows(
  platform: ExternalPlatform,
  deps: DetectDeps
): Promise<DetectedApp[]> {
  if (platform === 'win32') {
    return Promise.resolve([
      { app: { id: 'files', label: 'Windows Explorer', kind: 'files' }, launch: { kind: 'explorer' } }
    ])
  }
  if (platform === 'darwin') {
    return Promise.resolve([
      { app: { id: 'files', label: 'Finder', kind: 'files' }, launch: { kind: 'macFolder' } }
    ])
  }
  return linuxFileManagers(deps)
}

/**
 * Every named manager found, so a box with both Nautilus and Dolphin offers
 * both. When none answers, the xdg-open default is the last-resort row —
 * only then, since it would otherwise duplicate a named entry's job.
 */
async function linuxFileManagers(deps: DetectDeps): Promise<DetectedApp[]> {
  const found: DetectedApp[] = []
  for (const fm of LINUX_FILE_MANAGERS) {
    const resolved = await deps.resolveCommand(fm.command, LINUX_EXTRA_BINS(deps))
    if (resolved !== null) {
      found.push({
        app: { id: fm.id, label: fm.label, kind: 'files' },
        launch: { kind: 'exec', command: resolved }
      })
    }
  }
  if (found.length > 0) return found
  const xdg = await deps.resolveCommand('xdg-open', LINUX_EXTRA_BINS(deps))
  if (xdg !== null) {
    found.push({
      app: { id: 'files', label: 'System File Manager', kind: 'files' },
      launch: { kind: 'exec', command: xdg }
    })
  }
  return found
}

/**
 * Probe the catalog for one platform: the file manager(s) first, then every
 * detected editor sorted by label. Absent targets are simply not in the
 * list — nothing shown can be a dead click.
 */
export async function detectExternalApps(
  deps: DetectDeps,
  platform: ExternalPlatform
): Promise<DetectedApp[]> {
  const files = await platformFileManagerRows(platform, deps)
  const editors: DetectedApp[] = []
  for (const row of EDITOR_CATALOG) {
    const hit = await probeEditor(row, platform, deps)
    if (hit !== null) editors.push(hit)
  }
  editors.sort((a, b) => a.app.label.localeCompare(b.app.label))
  return [...files, ...editors]
}

// ----------------------------------------------------------- PATH search

/** Filesystem answers behind {@link findCommand}, so tests need no disk. */
export interface CommandRules {
  readonly platform: ExternalPlatform
  readonly env: NodeJS.ProcessEnv
  readonly isFile: (path: string) => Promise<boolean>
  /** POSIX executable-bit answer; unused on win32. */
  readonly isExecutable: (path: string) => Promise<boolean>
}

/**
 * The single PATH search both real and test code share: PATH (+ `extraDirs`)
 * in order — first match wins, like a shell would launch it. On Windows a
 * candidate needs a *spawnable* extension: the extensionless shims in VS
 * Code's bin folder exist but cannot go through CreateProcess, so plain
 * `command` only counts when the caller already spelled an exe extension.
 * POSIX hits must carry the executable bit.
 */
export async function findCommand(
  command: string,
  extraDirs: ReadonlyArray<string>,
  rules: CommandRules
): Promise<string | null> {
  const rawPath = rules.env.PATH ?? rules.env.Path ?? ''
  const dirs = [...rawPath.split(delimiter).filter(d => d.length > 0), ...extraDirs]
  const pathExts = rules.platform === 'win32'
    ? (rules.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(e => e.length > 0)
    : []
  const commandHasExeExt = pathExts.some(e => command.toLowerCase().endsWith(e.toLowerCase()))
  const candidatesOf = (base: string): string[] =>
    rules.platform !== 'win32'
      ? [base]
      : commandHasExeExt
        ? [base]
        : pathExts.map(ext => base + ext.toLowerCase())

  for (const dir of dirs) {
    for (const candidate of candidatesOf(join(dir, command))) {
      if (!(await rules.isFile(candidate))) continue
      if (rules.platform !== 'win32' && !(await rules.isExecutable(candidate))) continue
      return candidate
    }
  }
  return null
}

// -------------------------------------------------------------- launching

/**
 * Starts the target and resolves as soon as the process exists (same rule as
 * the reveal/open helpers in ipc.ts: the launcher hands off and its exit code
 * is not a meaningful failure signal — `explorer.exe` famously exits 1 *on
 * success*). macOS `open` is the exception: it exits *after* dispatching, so
 * there its status is checked and a failure gets a real message.
 */
export function openDetected(detected: DetectedApp, repoPath: string): Promise<void> {
  const spec = detected.launch
  switch (spec.kind) {
    case 'explorer':
      return launchDetached('explorer.exe', [repoPath])
    case 'exec':
      return launchDetached(spec.command, [repoPath])
    case 'cmdShim':
      return launchDetached('cmd.exe', ['/d', '/s', '/c', spec.shim, repoPath])
    case 'macFolder':
      return runUntilExit('open', [repoPath], 'the Finder')
    case 'macOpen':
      return runUntilExit('open', ['-a', spec.appName, repoPath], detected.app.label)
  }
}

/**
 * Starts a detached helper and resolves on `spawn`. A real failure — a
 * binary that cannot be started at all (removed since detection) — arrives
 * through the `error` event, not the exit code.
 */
export function launchDetached(
  command: string,
  args: ReadonlyArray<string>
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('error', rejectPromise)
    child.once('spawn', () => {
      child.unref()
      resolvePromise()
    })
  })
}

/** For helpers that exit *after* dispatching (macOS `open`): 0 means launched. */
function runUntilExit(
  command: string,
  args: ReadonlyArray<string>,
  label: string
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString('utf8')).slice(0, 4096)
    })
    child.once('error', rejectPromise)
    child.once('close', code => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const detail = stderr.trim().split(/\r?\n/)[0] ?? ''
      rejectPromise(
        new Error(`Could not open in ${label}${detail.length > 0 ? `: ${detail}` : ''}.`)
      )
    })
  })
}

// ---------------------------------------------------- ipc-facing surface

let cache: DetectedApp[] | null = null

function nodeDeps(): DetectDeps {
  const platform = currentPlatform()
  return {
    env: process.env,
    home: homedir(),
    exists: async path => {
      try {
        await stat(path)
        return true
      } catch {
        return false
      }
    },
    resolveCommand: (command, extraDirs) =>
      findCommand(command, extraDirs, {
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
      })
  }
}

function currentPlatform(): ExternalPlatform {
  return process.platform === 'win32' || process.platform === 'darwin'
    ? process.platform
    : 'linux'
}

/** The detected apps, cached across calls; `refresh` re-scans the machine. */
export async function getDetectedApps(refresh: boolean): Promise<DetectedApp[]> {
  if (!refresh && cache !== null) return cache
  cache = await detectExternalApps(nodeDeps(), currentPlatform())
  return cache
}

/**
 * Launches a *detected* app with the repository root. The id must be in the
 * detected set — an undetected (or invented) id is refused, so the
 * only-show-what-works guarantee holds for direct IPC callers too.
 */
export async function openRepoInApp(repoPath: string, appId: string): Promise<void> {
  const detected = (await getDetectedApps(false)).find(a => a.app.id === appId)
  if (detected === undefined) {
    throw new Error('That application is not available on this machine.')
  }
  try {
    if (!(await stat(repoPath)).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error(`${repoPath} does not exist on disk any more.`)
  }
  await openDetected(detected, repoPath)
}

/** Drop the detection cache (after installs/uninstalls, or for tests). */
export function resetDetectedAppsCache(): void {
  cache = null
}
