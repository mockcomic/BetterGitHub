import { existsSync, readdirSync } from 'fs'
import { basename } from 'path'
import {
  GitExecError,
  GitExecResult,
  execGit
} from './exec'
import {
  PUSH_NEEDS_PULL_MESSAGE,
  isRemoteMovedAhead
} from '../../shared/push-rejection'
import { getStatus } from './status'

export async function fetch(repoPath: string): Promise<string> {
  const r = await execGit(['fetch', '--prune', 'origin'], {
    cwd: repoPath,
    timeoutMs: 120_000
  })
  return (r.stderr + r.stdout).trim()
}

export async function push(repoPath: string): Promise<string> {
  const status = await getStatus(repoPath)
  if (status.detached || status.branch.length === 0) {
    throw new Error('Cannot push while on a detached HEAD.')
  }

  const upstream = await hasUpstream(repoPath)
  const args = upstream
    ? ['push']
    : ['push', '--set-upstream', 'origin', status.branch]

  let r: GitExecResult
  try {
    r = await execGit(args, { cwd: repoPath, timeoutMs: 120_000 })
  } catch (err) {
    // A push rejected because the remote moved ahead has a one-click
    // recovery (pull, then push again), so replace git's raw output — whose
    // first line is just "To <remote>" — with the message the renderer keys
    // its "Pull first" toast buttons on. Other rejections (protected
    // branches, hooks) stay raw errors.
    if (err instanceof GitExecError && isRemoteMovedAhead(err.result.stderr)) {
      throw new Error(PUSH_NEEDS_PULL_MESSAGE)
    }
    throw err
  }
  return (r.stderr + r.stdout).trim()
}

export async function pull(repoPath: string): Promise<string> {
  const status = await getStatus(repoPath)
  if (status.detached) {
    throw new Error('Cannot pull while on a detached HEAD — check out a branch first.')
  }
  const upstream = await hasUpstream(repoPath)
  const args =
    upstream || status.detached ? ['pull'] : ['pull', 'origin', status.branch]

  const r = await execGit(args, {
    cwd: repoPath,
    timeoutMs: 300_000
  })
  return (r.stderr + r.stdout).trim()
}

async function hasUpstream(repoPath: string): Promise<boolean> {
  try {
    const r = await execGit(
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
      { cwd: repoPath, timeoutMs: 10_000 }
    )
    return r.stdout.trim().length > 0
  } catch (err) {
    if (err instanceof GitExecError) return false
    throw err
  }
}

export async function getRemoteUrl(
  repoPath: string
): Promise<string | null> {
  try {
    const r = await execGit(['config', '--get', 'remote.origin.url'], {
      cwd: repoPath,
      timeoutMs: 10_000
    })
    const url = r.stdout.trim()
    return url.length > 0 ? url : null
  } catch (err) {
    if (err instanceof GitExecError) return null
    throw err
  }
}

/**
 * Points `origin` at `url`, adding the remote when the repository has none.
 * Refuses to silently move an existing, different origin.
 */
export async function addRemote(
  repoPath: string,
  url: string
): Promise<void> {
  const trimmed = url.trim()
  if (trimmed.length === 0) {
    throw new Error('Enter a repository URL.')
  }
  const existing = await getRemoteUrl(repoPath)
  if (existing === null) {
    await execGit(['remote', 'add', 'origin', trimmed], {
      cwd: repoPath,
      timeoutMs: 20_000
    })
    return
  }
  if (existing === trimmed) return
  throw new Error(
    `origin already points at ${existing}\nEnter a different remote URL or update .git/config manually.`
  )
}

export async function getConfigInfo(
  repoPath: string
): Promise<{ name: string | null; email: string | null }> {
  const read = async (key: string): Promise<string | null> => {
    try {
      const r = await execGit(['config', '--get', key], {
        cwd: repoPath,
        timeoutMs: 10_000
      })
      return r.stdout.trim() || null
    } catch (err) {
      if (err instanceof GitExecError) return null
      throw err
    }
  }
  const [name, email] = await Promise.all([
    read('user.name'),
    read('user.email')
  ])
  return { name, email }
}

/**
 * Writes the repository-local author identity — the fix for the missing
 * `user.name`/`user.email` that otherwise fails only at commit time.
 */
export async function setConfigInfo(
  repoPath: string,
  name: string,
  email: string
): Promise<void> {
  const trimmedName = name.trim()
  const trimmedEmail = email.trim()
  if (trimmedName.length === 0) {
    throw new Error('Author name cannot be empty.')
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
    throw new Error('Enter a valid email address, e.g. you@example.com.')
  }
  await execGit(['config', '--local', 'user.name', trimmedName], {
    cwd: repoPath,
    timeoutMs: 10_000
  })
  await execGit(['config', '--local', 'user.email', trimmedEmail], {
    cwd: repoPath,
    timeoutMs: 10_000
  })
}

export function suggestedCloneDirectory(url: string): string {
  const cleaned = url.replace(/\/+$/, '').replace(/\.git$/, '')
  const last = cleaned.split(/[\/:]/).pop() ?? 'repository'
  return basename(last) || 'repository'
}

export async function cloneRepository(
  url: string,
  destinationPath: string
): Promise<string> {
  if (url.trim().length === 0) {
    throw new Error('Enter a repository URL to clone.')
  }
  if (!existsSync(destinationPath)) {
    throw new Error(`Destination does not exist: ${destinationPath}`)
  }
  const existing = readdirSync(destinationPath)
  if (existing.length > 0) {
    throw new Error(
      `Destination folder is not empty: ${destinationPath}\nPick an empty folder to clone into.`
    )
  }

  const r = await execGit(
    ['clone', '--progress', '--end-of-options', url.trim(), destinationPath],
    { cwd: destinationPath, timeoutMs: 15 * 60_000 }
  )
  return (r.stderr + r.stdout).trim()
}

/** Validates that a directory is a usable git repository. */
export async function verifyRepository(path: string): Promise<void> {
  await execGit(['rev-parse', '--is-inside-work-tree'], {
    cwd: path,
    timeoutMs: 15_000
  })
}
