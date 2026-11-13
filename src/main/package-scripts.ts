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
  // npm strips a UTF-8 BOM when it reads package.json; JSON.parse does not,
  // and Windows editors add BOMs routinely. Match npm, or those projects
  // silently lose the whole desk.
  const text = json.charCodeAt(0) === 0xfeff ? json.slice(1) : json
  let doc: unknown
  try {
    doc = JSON.parse(text)
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
  const raw = scripts as Record<string, unknown>
  // Object.keys hoists integer-like keys to the front, which would silently
  // reorder the desk against the "in file order" contract (a script named
  // "2" is legal npm). Recover file order from the raw text positions.
  const withPos = Object.keys(raw).map(name => {
    const needle = `"${name}"`
    const at = text.indexOf(needle)
    return { name, pos: at === -1 ? Number.MAX_SAFE_INTEGER : at }
  })
  withPos.sort((a, b) => a.pos - b.pos)
  for (const { name } of withPos) {
    const command = raw[name]
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
  } catch (err) {
    // Absent is normal (most repos have none). Anything else — a lock, a
    // permission hold, AV interference on Windows — is worth explaining,
    // not pretending the file isn't there.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { manager, scripts: [], error: null }
    }
    return {
      manager,
      scripts: [],
      error: `Could not read package.json (${err instanceof Error ? err.message : String(err)}).`
    }
  }
  const parsed = parsePackageScripts(json)
  return { manager, scripts: parsed.scripts, error: parsed.error }
}
