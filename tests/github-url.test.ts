import { describe, expect, it } from 'vitest'
import {
  branchUrl,
  commitUrl,
  compareUrl,
  pullRequestUrl,
  toWebRepository
} from '../src/main/git/github-url'

describe('toWebRepository', () => {
  it('maps scp-like ssh remotes', () => {
    expect(toWebRepository('git@github.com:owner/repo.git')).toEqual({
      webUrl: 'https://github.com/owner/repo',
      host: 'github.com',
      path: 'owner/repo'
    })
  })

  it('maps https remotes and strips .git', () => {
    expect(toWebRepository('https://github.com/owner/repo.git')).toMatchObject({
      webUrl: 'https://github.com/owner/repo'
    })
    expect(toWebRepository('https://github.com/owner/repo/')).toMatchObject({
      webUrl: 'https://github.com/owner/repo'
    })
  })

  it('maps ssh:// and git:// URLs with a user', () => {
    expect(toWebRepository('ssh://git@gitlab.example.com/team/project.git')).toMatchObject({
      webUrl: 'https://gitlab.example.com/team/project'
    })
    expect(toWebRepository('git://github.com/o/r')).toMatchObject({
      webUrl: 'https://github.com/o/r'
    })
  })

  it('keeps nested groups', () => {
    expect(toWebRepository('git@host.example:group/sub/project.git')).toMatchObject({
      webUrl: 'https://host.example/group/sub/project'
    })
  })

  it('rejects null, empty, bare and local paths', () => {
    expect(toWebRepository(null)).toBeNull()
    expect(toWebRepository('   ')).toBeNull()
    expect(toWebRepository('not a url at all')).toBeNull()
    expect(toWebRepository('/tmp/local/repo')).toBeNull()
    // No owner/repo shape.
    expect(toWebRepository('git@host:project')).toBeNull()
  })
})

describe('web URLs', () => {
  const repo = toWebRepository('git@github.com:owner/repo.git')!

  it('builds commit, branch and compare URLs', () => {
    expect(commitUrl(repo, 'deadbeef')).toBe(
      'https://github.com/owner/repo/commit/deadbeef'
    )
    expect(branchUrl(repo, 'feature/my-thing')).toBe(
      'https://github.com/owner/repo/tree/feature/my-thing'
    )
    expect(compareUrl(repo, 'main', 'feature/x')).toBe(
      'https://github.com/owner/repo/compare/main...feature/x'
    )
  })
})

describe('pullRequestUrl', () => {
  const parent = toWebRepository('git@github.com:parent/repo.git')!

  it('opens the same-repo compare with the form expanded', () => {
    expect(pullRequestUrl(parent, 'main', { branch: 'feature/x' })).toBe(
      'https://github.com/parent/repo/compare/main...feature/x?expand=1'
    )
  })

  it('spells a fork head as user:repo:branch with literal colons', () => {
    expect(
      pullRequestUrl(parent, 'main', {
        branch: 'feature',
        forkOwner: 'octo',
        forkName: 'repo'
      })
    ).toBe('https://github.com/parent/repo/compare/main...octo:repo:feature?expand=1')
  })

  it('keeps fork branch slashes path-like and still encodes URL-awkward refs', () => {
    expect(
      pullRequestUrl(parent, 'main', {
        branch: 'fix/bug#1',
        forkOwner: 'octo',
        forkName: 'repo'
      })
    ).toBe('https://github.com/parent/repo/compare/main...octo:repo:fix/bug%231?expand=1')
  })

  it('targets the base repository — the parent, not the fork', () => {
    const fork = toWebRepository('https://github.com/octo/repo.git')!
    expect(
      pullRequestUrl(fork, 'main', { branch: 'feature' }).startsWith(
        'https://github.com/octo/repo/compare/'
      )
    ).toBe(true)
  })
})
