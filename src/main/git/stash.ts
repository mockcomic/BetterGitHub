import type { StashEntry } from '../../shared/models'
import { execGit } from './exec'
import { getStatus } from './status'

const FIELD_SEP = ''
const RECORD_SEP = ''

/** `%gd`, `%s`, `%cI`, then `%b` last: the body may contain any character
 *  git lets a message hold (newlines certainly), so it gets the tail.
 *  `%s` (the commit subject) and not `%gs`: git flattens the entire message
 *  into `%gs`, body included, so a subject+body stash would duplicate its
 *  body in the list label. git also prefixes custom messages with
 *  `On <branch>: ` — the branch parse below reads it back out. */
const STASH_FORMAT = ['%gd', '%s', '%cI', '%b'].join(FIELD_SEP) + RECORD_SEP

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

/**
 * Parses `git stash list --format=%gd<U+001F>%s<U+001F>%cI<U+001F>%b<U+001E>`.
 * The body (last field) keeps any separators after the third one.
 */
export function parseStashList(output: string): StashEntry[] {
  return output
    .split(RECORD_SEP)
    .map(r => r.replace(/^\n+/, ''))
    .filter(r => r.trim().length > 0)
    .map((record, index) => {
      const parts = record.split(FIELD_SEP)
      const label = parts[0] ?? ''
      const message = parts[1] ?? ''
      const date = parts[2] ?? ''
      const description = parts.slice(3).join(FIELD_SEP)
      // `%s` looks like `On main: my message` / `WIP on main: abc123 subject`.
      const onMatch = /^(?:On|WIP on)\s+([^:]+):/i.exec(message)
      return {
        index,
        label: label.trim() || `stash@{${index}}`,
        message: message.trim(),
        description: description.trim(),
        date: date.trim(),
        branch: onMatch?.[1]?.trim() ?? ''
      }
    })
}

/**
 * One `-m` string carrying a commit-style message: subject plus optional
 * body paragraph. git stores it verbatim as the stash commit's message, and
 * `%b` reads the body back.
 */
export function buildStashMessage(title: string, description = ''): string {
  const subject = title.trim()
  const body = description.trim()
  return body.length === 0 ? subject : `${subject}\n\n${body}`
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

/**
 * The full text diff of one entry, untracked files included when the
 * running git understands the flag; falls back to tracked-only. Fed to the
 * AI agent by the `summarizeStash` channel. Exit 1 (`No local changes`)
 * is tolerated so an empty diff surfaces as our own message, not a raw
 * GitExecError.
 */
export async function getStashDiff(
  repoPath: string,
  index: number
): Promise<string> {
  const OK = new Set([0, 1])
  let diff = ''
  try {
    const withUntracked = await execGit(
      ['stash', 'show', '-p', '--include-untracked', stashRef(index)],
      { cwd: repoPath, timeoutMs: 60_000, successExitCodes: OK }
    )
    diff = withUntracked.stdout
  } catch {
    // Older gits reject --include-untracked on `show`; retry without it.
    const tracked = await execGit(
      ['stash', 'show', '-p', stashRef(index)],
      { cwd: repoPath, timeoutMs: 60_000, successExitCodes: OK }
    )
    diff = tracked.stdout
  }
  if (diff.trim().length === 0) {
    throw new Error('This stash has no readable changes.')
  }
  return diff
}

/**
 * Rewrite one entry's message, keeping its changes. A stash commit object
 * is immutable and `git stash store` refuses to re-add the commit that is
 * already in the log (its `-m` only names a *new* entry), so the entry is
 * rebuilt as a fresh commit: same tree, same parents, same author and
 * committer stamps, new message. The new commit is stored (which prepends
 * an entry, pushing every later index up by one) and the old entry dropped
 * at its shifted position. If the drop fails the stash exists twice —
 * nothing is lost. `branch`, when given, restores git's own
 * `On <branch>: ` subject prefix so the entry keeps showing where it came
 * from, exactly like an entry created by `stash push -m`.
 */
export async function setStashMessage(
  repoPath: string,
  index: number,
  title: string,
  description = '',
  branch = ''
): Promise<void> {
  const subject = title.trim()
  if (subject.length === 0) {
    throw new Error('A stash message needs at least a subject line.')
  }
  const prefix = branch.trim().length > 0 ? `On ${branch.trim()}: ` : ''
  const message = buildStashMessage(prefix + subject, description)

  const sha = (
    await execGit(['rev-parse', stashRef(index)], {
      cwd: repoPath,
      timeoutMs: 15_000
    })
  ).stdout.trim()

  const meta = (
    await execGit(
      [
        'log',
        '-1',
        '--format=%an%x1f%ae%x1f%at%x1f%az%x1f%cn%x1f%ce%x1f%ct%x1f%cz%x1f%T%x1f%P',
        sha
      ],
      { cwd: repoPath, timeoutMs: 15_000 }
    )
  ).stdout.trim()
  const [
    authorName = '',
    authorEmail = '',
    authorTime = '',
    authorZone = '',
    committerName = '',
    committerEmail = '',
    commitTime = '',
    commitZone = '',
    tree = '',
    parentsLine = ''
  ] = meta.split(FIELD_SEP)
  if (tree.length === 0) {
    throw new Error(`stash@{${index}} does not name a readable commit.`)
  }

  const created = await execGit(
    [
      '-c',
      'commit.gpgsign=false',
      'commit-tree',
      tree,
      ...parentsLine
        .split(' ')
        .filter(p => p.length > 0)
        .flatMap(p => ['-p', p]),
      '-m',
      message
    ],
    {
      cwd: repoPath,
      timeoutMs: 30_000,
      env: {
        GIT_AUTHOR_NAME: authorName,
        GIT_AUTHOR_EMAIL: authorEmail,
        GIT_AUTHOR_DATE: `@${authorTime} ${authorZone}`,
        GIT_COMMITTER_NAME: committerName,
        GIT_COMMITTER_EMAIL: committerEmail,
        GIT_COMMITTER_DATE: `@${commitTime} ${commitZone}`
      }
    }
  )
  const newSha = created.stdout.trim()

  await execGit(['stash', 'store', newSha], {
    cwd: repoPath,
    timeoutMs: 30_000
  })
  // The stored entry took index 0; the entry being replaced shifted to n+1.
  await execGit(['stash', 'drop', stashRef(index + 1)], {
    cwd: repoPath,
    timeoutMs: 30_000
  })
}
