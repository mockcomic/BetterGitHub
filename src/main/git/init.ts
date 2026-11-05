import { existsSync, readdirSync, statSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
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
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('Enter a repository name.')
  }
  if (INVALID_NAME_CHARS.test(trimmed) || trimmed === '.' || trimmed === '..') {
    throw new Error(
      'That name cannot be a folder here — avoid slashes and reserved characters.'
    )
  }
  if (!existsSync(parentDir) || !statSync(parentDir).isDirectory()) {
    throw new Error(`Parent folder does not exist: ${parentDir}`)
  }
  const target = join(parentDir, trimmed)
  if (existsSync(target)) {
    const entries = readdirSync(target)
    if (entries.length > 0) {
      throw new Error(
        `A folder named ${trimmed} already exists and is not empty:\n${target}`
      )
    }
  } else {
    await mkdir(target, { recursive: true })
  }

  await execGit(['init'], { cwd: target, timeoutMs: 30_000 })
  if (addReadme) {
    await writeFile(join(target, 'README.md'), `# ${trimmed}\n`, 'utf8')
    await execGit(['add', 'README.md'], { cwd: target, timeoutMs: 20_000 })
  }
  return addRepository(target)
}
