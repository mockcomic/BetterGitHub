import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import type { PackageScript, PackageScripts, PackageManager } from '../shared/scripts'
import { verifyRepository } from './git/sync'

/**
 * Reading a repository's package.json scripts for the Scripts desk.
 *
 * Like src/main/terminal.ts, the interesting logic is pure ({@link
 * parsePackageScripts}, {@link detectPackageManager}) and the IO wrapper at
 * the bottom is the surface src/main/ipc.ts wires to IPC — the whole module
 * is unit-testable without a real repository.
 */

/** One lockfile marker above its manager; the first present one wins. */
const LOCKFILE_PRIORITY: ReadonlyArray<readonly [string, PackageManager]> = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm']
]

/**
 * Which manager verb a Run press should type, from the lockfiles present in
 * the repository root. bun > pnpm > yarn > npm: the most specific lockfile
 * wins when a migrated repo keeps several, and a folder with none defaults
 * to npm — the only manager guaranteed by the scripts themselves.
 */
export function detectPackageManager(
  presentFiles: ReadonlySet<string>
): PackageManager {
  for (const [file, manager] of LOCKFILE_PRIORITY) {
    if (presentFiles.has(file)) return manager
  }
  return 'npm'
}

export interface ParsedPackageJson {
  readonly scripts: ReadonlyArray<PackageScript>
  readonly error: string | null
}

/**
 * The `scripts` entries of one package.json's text, in file order. A
 * malformed file answers the reason instead of throwing (a watcher-driven
 * refresh must not toast per keystroke-save); anything that is not a
 * string-valued entry is skipped — npm itself ignores those, and one junk
 * row should not hide the usable ones.
 */
export function parsePackageScripts(json: string): ParsedPackageJson {
  let doc: unknown
  try {
    doc = JSON.parse(json)
  } catch (err) {
    return {
      scripts: [],
      error: `package.json is not valid JSON (${err instanceof Error ? err.message : String(err)}).`
    }
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { scripts: [], error: 'package.json is not a JSON object.' }
  }
  const scripts = (doc as { scripts?: unknown }).scripts
  if (scripts === undefined || scripts === null) {
    return { scripts: [], error: null }
  }
  if (typeof scripts !== 'object' || Array.isArray(scripts)) {
    return { scripts: [], error: 'package.json has no “scripts” object.' }
  }
  const entries: PackageScript[] = []
  for (const [name, command] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof command === 'string') entries.push({ name, command })
  }
  return { scripts: entries, error: null }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** The names of the lockfile markers present in a repository root. */
async function presentLockfiles(repoPath: string): Promise<Set<string>> {
  const present = new Set<string>()
  for (const [file] of LOCKFILE_PRIORITY) {
    if (await exists(join(repoPath, file))) present.add(file)
  }
  return present
}

/**
 * The IPC entry point: validates the folder exactly like the other repo
 * verbs, then reads `<root>/package.json`. A missing file is not an error —
 * the vast majority of repositories have none, and the desk simply hides the
 * Scripts tab for them.
 */
export async function getPackageScripts(repoPath: string): Promise<PackageScripts> {
  await verifyRepository(repoPath)
  const manager = detectPackageManager(await presentLockfiles(repoPath))
  let json: string
  try {
    json = await readFile(join(repoPath, 'package.json'), 'utf8')
  } catch {
    return { manager, scripts: [], error: null }
  }
  const parsed = parsePackageScripts(json)
  return { manager, scripts: parsed.scripts, error: parsed.error }
}
