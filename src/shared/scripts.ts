/**
 * The package-scripts contract shared by every layer.
 *
 * One repository-root `package.json` is read by the main process
 * (src/main/package-scripts.ts) and surfaced to the renderer through the
 * `getPackageScripts` channel; the renderer draws one Run button per entry
 * (components/ScriptsSidebar.tsx) and presses it by *typing* the command
 * into a live integrated-terminal session (components/TerminalPanel.tsx) —
 * the same bytes a keyboard would produce, so streaming, colours, Ctrl+C and
 * the surviving prompt after the script exits all come for free.
 */

/** Which package manager verb a Run press types, chosen from lockfiles. */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** One entry of package.json's `scripts` map. */
export interface PackageScript {
  readonly name: string
  /** The script's own command text, shown next to the name in the list. */
  readonly command: string
}

/**
 * What `getPackageScripts` answers for one repository. `error` explains a
 * non-empty reason the list is empty (malformed JSON, unreadable file) —
 * carried as data rather than thrown so a watcher-driven refresh never turns
 * one broken `package.json` into a toast storm.
 */
export interface PackageScripts {
  readonly manager: PackageManager
  readonly scripts: ReadonlyArray<PackageScript>
  readonly error: string | null
}

/**
 * Script names npm itself accepts anywhere a shell would see them: a bare
 * `npm run dev` is typed as-is only for these.
 */
const SAFE_NAME = /^[A-Za-z0-9_@:.\-\/]+$/

/**
 * Quote one script name for the shell that will receive the typed line.
 * Double quotes are the one spelling cmd, PowerShell and POSIX shells all
 * treat as a single argument. A name carrying its own double quote cannot be
 * quoted portably into any of them — npm itself can barely run those — so it
 * is wrapped as-is and documented as unsupported rather than half-escaped.
 */
export function quoteScriptName(name: string): string {
  if (SAFE_NAME.test(name)) return name
  return `"${name}"`
}

/**
 * The exact line a Run press types into the terminal for one script, e.g.
 * `npm run dev`, `pnpm run build`, `npm run "build: win"`.
 */
export function scriptCommandLine(
  info: Pick<PackageScripts, 'manager'>,
  name: string
): string {
  return `${info.manager} run ${quoteScriptName(name)}`
}
