import { describe, expect, it } from 'vitest'
import {
  branchUrl,
  commitUrl,
  compareUrl,
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
