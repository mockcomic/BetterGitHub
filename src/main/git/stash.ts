import type { StashEntry } from '../../shared/models'
import { execGit } from './exec'
import { getStatus } from './status'

const FIELD_SEP = ''
const RECORD_SEP = ''

const STASH_FORMAT = ['%gd', '%gs', '%cI'].join(FIELD_SEP) + RECORD_SEP

/**
 * `git stash` ("Fork and hold" in GitHub Desktop): save the whole working
 * tree — including untracked files — away, then apply/pop/drop entries.
 */
export async function listStashes(repoPath: string): Promise<StashEntry[]> {
  const result = await execGit(
    ['stash', 'list', `--format=${STASH_FORMAT}`],
    { cwd: repoPath, timeoutMs: 15_000 }
  )
  return parseStashList(result.stdout)
}

/** Parses `git stash list --format=%gd<U+001F>%gs<U+001F>%cI<U+001E>`. */
export function parseStashList(output: string): StashEntry[] {
  return output
    .split(RECORD_SEP)
    .map(r => r.replace(/^\n+/, ''))
    .filter(r => r.trim().length > 0)
    .map((record, index) => {
      const [label = '', message = '', date = ''] = record.split(FIELD_SEP)
      // `%gs` looks like `On main: my message` / `WIP on main: abc123 subject`.
      const onMatch = /^(?:On|WIP on)\s+([^:]+):/i.exec(message)
      return {
        index,
        label: label.trim() || `stash@{${index}}`,
        message: message.trim(),
        date: date.trim(),
        branch: onMatch?.[1]?.trim() ?? ''
      }
    })
}

/** Stashes tracked and untracked changes; returns the recorded message. */
export async function stashAll(
  repoPath: string,
  message?: string
): Promise<string> {
  const status = await getStatus(repoPath)
  if (status.files.length === 0) {
    throw new Error('There is nothing to stash.')
  }
  if (status.conflictCount > 0) {
    throw new Error(
      'Resolve or discard the conflicted files before stashing changes.'
    )
  }

  const trimmed = message?.trim()
  const label =
    trimmed !== undefined && trimmed.length > 0
      ? trimmed
      : `Aspen on ${status.branch || 'HEAD'}`

  const result = await execGit(
    ['stash', 'push', '--include-untracked', '-m', label],
    { cwd: repoPath, timeoutMs: 60_000 }
  )
  const out = (result.stderr + result.stdout).trim()
  if (/No local changes to save/i.test(out)) {
    throw new Error('There is nothing to stash.')
  }
  return label
}

function stashRef(index: number): string {
  return `stash@{${index}}`
}

export async function applyStash(
  repoPath: string,
  index: number
): Promise<void> {
  await execGit(['stash', 'apply', '--index', stashRef(index)], {
    cwd: repoPath,
    timeoutMs: 60_000
  })
}

export async function popStash(
  repoPath: string,
  index: number
): Promise<void> {
  await execGit(['stash', 'pop', '--index', stashRef(index)], {
    cwd: repoPath,
    timeoutMs: 60_000
  })
}

export async function dropStash(
  repoPath: string,
  index: number
): Promise<void> {
  await execGit(['stash', 'drop', stashRef(index)], {
    cwd: repoPath,
    timeoutMs: 30_000
  })
}
