import { existsSync, readdirSync, statSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { Repository } from '../../shared/models'
import { addRepository } from '../settings'
import { execGit } from './exec'

/**
 * Creating a brand-new repository on disk — the local half of the
 * "Create repository…" dialog. Publishing it to a hosted account is a
 * separate verb (git/sync.ts publishRepository), so a folder created here
 * can sit and take its first commit before anything touches the network.
 */

/** Folder names git and every provider reject; separators included below. */
const INVALID_NAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/

/** Trims a user-typed folder name and refuses what cannot be one, shared by
 *  the Create and Clone flows so both dialogs answer the same way. */
export function assertValidFolderName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('Enter a repository name.')
  }
  if (INVALID_NAME_CHARS.test(trimmed) || trimmed === '.' || trimmed === '..') {
    throw new Error(
      'That name cannot be a folder here — avoid slashes and reserved characters.'
    )
  }
  return trimmed
}

/** Where a repository is about to land, with the folder name accepted for it.
 *  The folder itself is deliberately *not* created here — see below. */
export interface PreparedFolder {
  readonly destination: string
  readonly name: string
}

/**
 * Validate `<parentDir>/<name>` for a repository that is about to appear on
 * disk: the parent must already exist, and the folder must be absent or empty.
 * Both verbs that materialise a repository — `git init` here and `git clone` in
 * sync.ts — run the destination through this, so neither can be tripped by a
 * folder that already holds work.
 *
 * The folder is left for git to create, on purpose. `git init <path>` and
 * `git clone <url> <path>` lay the directory down themselves, so an in-process
 * `mkdir` buys nothing and asks the app for a write permission it does not
 * always hold — Aspen's own writes (and its git children's) are already
 * integrity-limited when the app is launched from an agent or command sandbox
 * (see git/exec.ts), and a denied mkdir then fails Clone with a raw
 * `EPERM: operation not permitted, mkdir '…'` while git could have made the
 * same folder as its first act. git owns the layout either way, so let the
 * child process create it and drop the extra permission requirement.
 */
export async function prepareRepositoryFolder(
  parentDir: string,
  name: string
): Promise<PreparedFolder> {
  const trimmed = assertValidFolderName(name)
  if (!existsSync(parentDir) || !statSync(parentDir).isDirectory()) {
    throw new Error(`Parent folder does not exist: ${parentDir}`)
  }
  const target = join(parentDir, trimmed)
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(
      `A folder named ${trimmed} already exists and is not empty:\n${target}`
    )
  }
  return { destination: target, name: trimmed }
}

/**
 * Create `<parentDir>/<name>`, `git init` it, optionally write and stage a
 * README, and add it to the app's repository list. The README is left
 * staged-but-uncommitted on purpose: the commit needs an identity, and the
 * app already has a warn-and-block flow for that in the commit pane — an
 * inline error here would duplicate it with worse copy.
 */
export async function createLocalRepository(
  parentDir: string,
  name: string,
  addReadme: boolean
): Promise<Repository> {
  const { destination: target, name: folder } = await prepareRepositoryFolder(
    parentDir,
    name
  )

  // `git init <path>` creates the path, so the child still needs only the
  // parent as its working directory.
  await execGit(['init', '--quiet', target], {
    cwd: parentDir,
    timeoutMs: 30_000
  })
  if (addReadme) {
    await writeFile(join(target, 'README.md'), `# ${folder}\n`, 'utf8')
    await execGit(['add', 'README.md'], { cwd: target, timeoutMs: 20_000 })
  }
  return addRepository(target)
}
