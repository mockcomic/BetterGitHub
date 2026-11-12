import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { RemoteRepository } from '../src/shared/models'
import { execGit } from '../src/main/git/exec'
import { getRemoteUrl } from '../src/main/git/sync'
import {
  getRemoteUrlNamed,
  precheckFork,
  pullRequestUrlFor,
  retargetToFork
} from '../src/main/git/fork'

/**
 * Integration coverage for the fork flow's git halves (src/main/git/fork.ts):
 * the pre-API checks, the remote swap, and the pull-request URL resolution.
 * Every remote is a github.com-shaped URL that is never contacted — the
 * default-branch read goes through `symbolic-ref refs/remotes/<remote>/HEAD`,
 * exactly what a clone or fetch leaves behind — so the suite needs no network.
 * Each test gets a fresh one-commit repository.
 */

const PARENT = 'https://github.com/parent/repo.git'
const FORK_CLONE_URL = 'https://github.com/octo/repo.git'

const forkRecord: RemoteRepository = {
  accountId: 'acct-1',
  fullName: 'octo/repo',
  name: 'repo',
  isPrivate: false,
  cloneUrl: FORK_CLONE_URL,
  sshUrl: null,
  webUrl: 'https://github.com/octo/repo',
  defaultBranch: 'main',
  pushedAt: null,
  description: null
}

let repo = ''
const madeRepos: string[] = []

function git(args: ReadonlyArray<string>): Promise<string> {
  return execGit(args, { cwd: repo, timeoutMs: 30_000 }).then(r =>
    (r.stdout + r.stderr).trim()
  )
}

async function setRemote(name: string, url: string): Promise<void> {
  await git(['remote', 'add', name, url])
}

async function commitTip(): Promise<string> {
  await git(['commit', '--quiet', '--allow-empty', '-m', 'work'])
  return (await git(['rev-parse', 'HEAD'])).trim()
}

async function newRepo(): Promise<void> {
  repo = mkdtempSync(join(tmpdir(), 'aspen-fork-'))
  madeRepos.push(repo)
  await git(['init', '--initial-branch=main', '--quiet', repo])
  await git(['config', 'user.name', 'Test Author'])
  await git(['config', 'user.email', 'test@example.com'])
  await commitTip()
}

beforeAll(() => {
  // Isolate from the developer's global/system config, like the other
  // git-integration suites.
  process.env['GIT_CONFIG_GLOBAL'] = join(tmpdir(), 'aspen-fork-no-global-config')
  process.env['GIT_CONFIG_SYSTEM'] = join(tmpdir(), 'aspen-fork-no-system-config')
})

afterAll(() => {
  for (const path of madeRepos) {
    rmSync(path, { recursive: true, force: true })
  }
})

beforeEach(newRepo)

describe('precheckFork', () => {
  it('reports the origin repository as the fork parent', async () => {
    await setRemote('origin', PARENT)
    const parent = await precheckFork(repo)
    expect(parent.fullName).toBe('parent/repo')
    expect(parent.web.webUrl).toBe('https://github.com/parent/repo')
  })

  it('refuses a repository with no parseable origin', async () => {
    await expect(precheckFork(repo)).rejects.toThrow(/no GitHub-style origin/i)
  })

  it('refuses an upstream remote that points elsewhere, before the API call', async () => {
    await setRemote('origin', PARENT)
    await setRemote('upstream', 'https://gitlab.example/team/other.git')
    await expect(precheckFork(repo)).rejects.toThrow(/"upstream" remote pointing at/)
  })

  it('allows the hand-fork layout where upstream already IS the origin', async () => {
    await setRemote('origin', PARENT)
    await setRemote('upstream', PARENT)
    await expect(precheckFork(repo)).resolves.toMatchObject({
      fullName: 'parent/repo'
    })
  })

  it('refuses a detached HEAD — the flow always pushes the current branch', async () => {
    await setRemote('origin', PARENT)
    const sha = (await git(['rev-parse', 'HEAD'])).trim()
    await git(['checkout', '--detach', sha])
    await expect(precheckFork(repo)).rejects.toThrow(/Check out a branch/)
  })
})

describe('retargetToFork', () => {
  it('renames origin to upstream and points origin at the fork', async () => {
    await setRemote('origin', PARENT)
    await retargetToFork(repo, forkRecord)
    expect(await getRemoteUrl(repo)).toBe(FORK_CLONE_URL)
    expect(await getRemoteUrlNamed(repo, 'upstream')).toBe(PARENT)
  })

  it('converges when the parent is already upstream (the manual layout)', async () => {
    await setRemote('origin', PARENT)
    await setRemote('upstream', PARENT)
    await retargetToFork(repo, forkRecord)
    expect(await getRemoteUrl(repo)).toBe(FORK_CLONE_URL)
    expect(await getRemoteUrlNamed(repo, 'upstream')).toBe(PARENT)
  })
})

describe('pullRequestUrlFor', () => {
  function fakeRemoteHead(remote: string, branch: string): Promise<string> {
    return git([
      'symbolic-ref',
      `refs/remotes/${remote}/HEAD`,
      `refs/remotes/${remote}/${branch}`
    ])
  }

  it('needs the branch pushed to origin first', async () => {
    await setRemote('origin', PARENT)
    await git(['checkout', '-b', 'unpushed'])
    await fakeRemoteHead('origin', 'main')
    await expect(pullRequestUrlFor(repo)).rejects.toThrow(/Push this branch first/)
  })

  it('answers a same-repository default branch with the reason', async () => {
    await setRemote('origin', PARENT)
    await fakeRemoteHead('origin', 'main')
    const sha = (await git(['rev-parse', 'HEAD'])).trim()
    await git(['update-ref', 'refs/remotes/origin/main', sha])
    await expect(pullRequestUrlFor(repo)).rejects.toThrow(/default branch/)
  })

  it('builds the same-repo new-PR URL for a pushed branch', async () => {
    await setRemote('origin', PARENT)
    const sha = await commitTip()
    await git(['checkout', '-b', 'feature/x'])
    await fakeRemoteHead('origin', 'main')
    await git(['update-ref', 'refs/remotes/origin/feature/x', sha])
    expect(await pullRequestUrlFor(repo)).toBe(
      'https://github.com/parent/repo/compare/main...feature/x?expand=1'
    )
  })

  it('targets the parent repository with a cross-fork head ref', async () => {
    await setRemote('origin', FORK_CLONE_URL)
    await setRemote('upstream', PARENT)
    const sha = await commitTip()
    await git(['checkout', '-b', 'feature'])
    await fakeRemoteHead('upstream', 'main')
    await git(['update-ref', 'refs/remotes/origin/feature', sha])
    expect(await pullRequestUrlFor(repo)).toBe(
      'https://github.com/parent/repo/compare/main...octo:repo:feature?expand=1'
    )
  })

  it('treats an upstream that duplicates the origin as same-repo', async () => {
    // An `upstream` registered with the very same URL (only reachable before
    // precheck runs, e.g. a hand-made config) must not become a fork head.
    await setRemote('origin', PARENT)
    await setRemote('upstream', 'https://github.com/parent/repo')
    const sha = await commitTip()
    await git(['checkout', '-b', 'feature'])
    await fakeRemoteHead('origin', 'main')
    await git(['update-ref', 'refs/remotes/origin/feature', sha])
    expect(await pullRequestUrlFor(repo)).toBe(
      'https://github.com/parent/repo/compare/main...feature?expand=1'
    )
  })
})
