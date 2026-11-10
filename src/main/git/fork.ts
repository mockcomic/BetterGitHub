import type { RemoteRepository } from '../../shared/models'
import { buildTokenAuthEnv, isGitAuthFailure, type GitTokenCredential } from './auth'
import { execGit, GitExecError } from './exec'
import { execGitWithTokenRetry, getRemoteUrl } from './sync'
import {
  pullRequestUrl,
  toWebRepository,
  type PullRequestHead,
  type WebRepository
} from './github-url'
import { getStatus } from './status'

/**
 * The fork and pull-request half of the GitHub workflow the app runs:
 *
 *  - `precheckFork` answers "can this repository be forked at all" before
 *    any API call, so a repository that would strand the user mid-flow
 *    never leaves a fresh fork sitting on GitHub (the same orphan-guard
 *    discipline as `precheckPublish`).
 *  - `retargetToFork` performs the remote swap the fork flow promises:
 *    `origin` becomes the fork (every existing verb — Push, Fetch, Pull,
 *    the ahead/behind counts — now speaks to it) and the parent is kept as
 *    `upstream`, mirroring the layout the manual fork-and-pull-request
 *    workflow already uses.
 *  - `pullRequestUrlFor` assembles the new-PR URL for both layouts: a plain
 *    branch of origin, or a cross-repository head when the origin is a fork
 *    of the upstream parent.
 */

/** The repository a fork would be made from, parsed out of `origin`. */
export interface ForkParent {
  /** `owner/repo` — exactly what the provider's fork call takes. */
  readonly fullName: string
  readonly web: WebRepository
}

/** Case- and shape-insensitive comparison of two remotes' web identities. */
function sameRepository(a: string | null, b: string | null): boolean {
  const wa = toWebRepository(a)
  const wb = toWebRepository(b)
  return (
    wa !== null &&
    wb !== null &&
    wa.webUrl.toLowerCase() === wb.webUrl.toLowerCase()
  )
}

/** The URL registered for one named remote, or null when it does not exist. */
export async function getRemoteUrlNamed(
  repoPath: string,
  remote: string
): Promise<string | null> {
  try {
    const r = await execGit(['remote', 'get-url', remote], {
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
 * The pre-API fork checks: an origin the provider layer can parse, and the
 * `upstream` name either free or already pointing at that same origin (the
 * hand-forked layout — the flow converges on it instead of colliding with
 * it). A different `upstream` is refused here, before a fork could be
 * created and left orphaned.
 */
export async function precheckFork(repoPath: string): Promise<ForkParent> {
  const originUrl = await getRemoteUrl(repoPath)
  const origin = toWebRepository(originUrl)
  if (origin === null) {
    throw new Error(
      'This repository has no GitHub-style origin to fork — add a remote URL first.'
    )
  }
  const upstreamUrl = await getRemoteUrlNamed(repoPath, 'upstream')
  if (upstreamUrl !== null && !sameRepository(upstreamUrl, originUrl)) {
    throw new Error(
      `This repository already has an "upstream" remote pointing at ${upstreamUrl} — ` +
        'the fork flow needs that name free (or pointed at the origin repository itself).'
    )
  }
  // The flow always ends by pushing the current branch — a detached HEAD
  // would fork the repository and strand the fork with nothing on it.
  const { branch, detached } = await getStatus(repoPath)
  if (detached || branch.length === 0) {
    throw new Error(
      'Check out a branch before forking — the fork flow pushes it to your fork.'
    )
  }
  return { fullName: origin.path, web: origin }
}

/**
 * The remote swap: parent → `upstream`, fork → `origin`. When the parent was
 * already registered as `upstream` (the manual layout), the duplicated
 * origin is simply dropped. Any half-failure is reported with the exact
 * manual finish, because the fork already exists and must not be lost.
 */
export async function retargetToFork(
  repoPath: string,
  fork: RemoteRepository
): Promise<void> {
  const upstreamExists = (await getRemoteUrlNamed(repoPath, 'upstream')) !== null
  try {
    if (upstreamExists) {
      await execGit(['remote', 'remove', 'origin'], {
        cwd: repoPath,
        timeoutMs: 20_000
      })
    } else {
      // The rename carries every origin/* remote-tracking ref along —
      // the parent's branches stay readable without another fetch.
      await execGit(['remote', 'rename', 'origin', 'upstream'], {
        cwd: repoPath,
        timeoutMs: 20_000
      })
    }
    await execGit(['remote', 'add', 'origin', fork.cloneUrl], {
      cwd: repoPath,
      timeoutMs: 20_000
    })
  } catch (err) {
    throw new Error(
      `The fork was created (${fork.webUrl}) but the remotes could not be rewired: ` +
        `${err instanceof Error ? err.message : String(err)}\n` +
        `Finish by hand: set origin to ${fork.cloneUrl} and the parent as upstream — ` +
        'then Push retries.'
    )
  }
}

/**
 * The fork flow's push, shaped exactly like the publish push: pinned to the
 * chosen account's own token first, falling back to the credential-helper +
 * account-retry path. After a failure the remotes stay as rewired — Push
 * retries.
 */
export async function pushCurrentBranchToFork(
  repoPath: string,
  forkCloneUrl: string,
  credential: GitTokenCredential | null
): Promise<string> {
  const { branch, detached } = await getStatus(repoPath)
  if (detached || branch.length === 0) {
    throw new Error(
      'Cannot push to the fork while on a detached HEAD — check out a branch first.'
    )
  }
  const args = ['push', '--set-upstream', 'origin', branch]
  const options = { cwd: repoPath, timeoutMs: 120_000 }
  const env =
    credential === null ? null : buildTokenAuthEnv(forkCloneUrl, credential)
  let r
  try {
    r = await execGit(args, env === null ? options : { ...options, env })
  } catch (err) {
    if (
      err instanceof GitExecError &&
      isGitAuthFailure(`${err.result.stderr}\n${err.result.stdout}`)
    ) {
      r = await execGitWithTokenRetry(args, options, forkCloneUrl)
    } else if (err instanceof GitExecError) {
      throw new Error(
        `${err.message}\nOrigin now points at your fork — Push retries.`
      )
    } else {
      throw err
    }
  }
  return (r.stderr + r.stdout).trim()
}

/** True when a fully-qualified ref exists in this repository. */
async function refExists(repoPath: string, ref: string): Promise<boolean> {
  try {
    await execGit(['show-ref', '--verify', '--quiet', ref], {
      cwd: repoPath,
      timeoutMs: 10_000
    })
    return true
  } catch (err) {
    if (err instanceof GitExecError) return false
    throw err
  }
}

/**
 * The remote's default branch: the `refs/remotes/<remote>/HEAD` symbolic ref
 * when a fetch has recorded one, otherwise live `ls-remote --symref` against
 * the remote URL as it is registered (ssh remotes keep working — the web
 * URL would prompt for credentials they do not have).
 */
async function defaultBranchOf(
  repoPath: string,
  remote: string,
  remoteUrl: string
): Promise<string> {
  try {
    const r = await execGit(
      ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`],
      { cwd: repoPath, timeoutMs: 10_000 }
    )
    const ref = r.stdout.trim()
    const prefix = `${remote}/`
    if (ref.startsWith(prefix) && ref.length > prefix.length) {
      return ref.slice(prefix.length)
    }
  } catch (err) {
    if (!(err instanceof GitExecError)) throw err
  }
  try {
    const r = await execGit(
      ['ls-remote', '--symref', '--end-of-options', remoteUrl, 'HEAD'],
      { cwd: repoPath, timeoutMs: 30_000 }
    )
    const m = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(r.stdout)
    if (m !== null) return m[1]
  } catch (err) {
    if (!(err instanceof GitExecError)) throw err
  }
  throw new Error(
    `Could not determine ${remote}'s default branch — run Fetch and try again.`
  )
}

/**
 * The new-pull-request URL for the current branch, ready for the browser.
 * The base is `upstream` when the origin is a fork of it (the layout the
 * fork flow leaves, and the one manual forking has always used); otherwise
 * the origin is both sides and GitHub's own form handles the same-repo case.
 * The head must already be pushed — the message sends the user one verb
 * (Push) instead of an empty compare page.
 */
export async function pullRequestUrlFor(repoPath: string): Promise<string> {
  const { branch, detached } = await getStatus(repoPath)
  if (detached || branch.length === 0) {
    throw new Error(
      'Check out a branch before creating a pull request.'
    )
  }
  const originUrl = await getRemoteUrl(repoPath)
  const origin = toWebRepository(originUrl)
  if (origin === null) {
    throw new Error(
      'No GitHub-style origin — there is no host to open a pull request against.'
    )
  }
  const upstreamUrl = await getRemoteUrlNamed(repoPath, 'upstream')
  const upstream =
    upstreamUrl === null ? null : toWebRepository(upstreamUrl)
  const forkLayout =
    upstream !== null && !sameRepository(upstreamUrl, originUrl)

  const baseRepo = forkLayout && upstream !== null ? upstream : origin
  const baseRemote = forkLayout ? 'upstream' : 'origin'
  const baseRemoteUrl =
    forkLayout && upstreamUrl !== null ? upstreamUrl : (originUrl ?? '')
  const baseBranch = await defaultBranchOf(repoPath, baseRemote, baseRemoteUrl)

  // A same-repository PR whose head is the base is the empty compare page —
  // the push toast's Create Pull Request button may land here, so the
  // answer is the reason, not a browser tab of nothing. (A fork's default
  // branch is different: main → upstream's main is a real contribution.)
  if (!forkLayout && branch === baseBranch) {
    throw new Error(
      'The current branch is the default branch — there is nothing to merge into it. Switch to a branch, push it, then open the pull request.'
    )
  }

  if (!(await refExists(repoPath, `refs/remotes/origin/${branch}`))) {
    throw new Error(
      'Push this branch first — the pull request sends it as its head.'
    )
  }

  let head: PullRequestHead = { branch }
  if (forkLayout) {
    const segments = origin.path.split('/')
    if (segments.length >= 2) {
      head = {
        branch,
        forkOwner: segments[0],
        forkName: segments.slice(1).join('/')
      }
    }
  }
  return pullRequestUrl(baseRepo, baseBranch, head)
}
