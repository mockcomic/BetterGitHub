import { describe, expect, it } from 'vitest'
import {
  githubRepoHost,
  githubSiteRoot,
  mapGitHubIdentity,
  mapGitHubRepo,
  mapGitHubRepoPage,
  normalizeGitHubApiBase
} from '../src/main/providers/github'
import {
  mapGitLabIdentity,
  mapGitLabProject,
  mapGitLabRepoPage,
  normalizeGitLabApiBase
} from '../src/main/providers/gitlab'

describe('normalizeGitHubApiBase', () => {
  it('defaults to the cloud REST root', () => {
    expect(normalizeGitHubApiBase(undefined)).toBe('https://api.github.com')
    expect(normalizeGitHubApiBase('   ')).toBe('https://api.github.com')
  })

  it('maps every github.com spelling to api.github.com', () => {
    expect(normalizeGitHubApiBase('https://github.com')).toBe('https://api.github.com')
    expect(normalizeGitHubApiBase('github.com')).toBe('https://api.github.com')
    expect(normalizeGitHubApiBase('https://www.github.com/')).toBe('https://api.github.com')
    expect(normalizeGitHubApiBase('https://api.github.com/')).toBe('https://api.github.com')
  })

  it('appends /api/v3 to an enterprise host, keeping an explicit root', () => {
    expect(normalizeGitHubApiBase('https://ghe.corp.example')).toBe(
      'https://ghe.corp.example/api/v3'
    )
    expect(normalizeGitHubApiBase('ghe.corp.example')).toBe(
      'https://ghe.corp.example/api/v3'
    )
    expect(normalizeGitHubApiBase('https://ghe.corp.example/api/v3/')).toBe(
      'https://ghe.corp.example/api/v3'
    )
  })
})

describe('githubRepoHost', () => {
  it('derives the git host behind the REST root', () => {
    expect(githubRepoHost('https://api.github.com')).toBe('github.com')
    expect(githubRepoHost('https://ghe.corp.example/api/v3')).toBe('ghe.corp.example')
  })
})

describe('githubSiteRoot', () => {
  it('maps the REST root back to the web root for device endpoints', () => {
    expect(githubSiteRoot('https://api.github.com')).toBe('https://github.com')
    expect(githubSiteRoot('https://ghe.corp.example/api/v3')).toBe('https://ghe.corp.example')
  })
})

describe('mapGitHubIdentity', () => {
  it('reads login/name/avatar and falls back sensibly', () => {
    expect(
      mapGitHubIdentity({
        login: 'octo',
        name: 'Octo Cat',
        avatar_url: 'https://avatars.githubusercontent.com/u/1'
      })
    ).toEqual({
      login: 'octo',
      displayName: 'Octo Cat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1'
    })
    expect(mapGitHubIdentity({ login: 'octo' })).toEqual({
      login: 'octo',
      displayName: 'octo',
      avatarUrl: null
    })
    expect(mapGitHubIdentity({ id: 7 })).toBeNull()
  })
})

describe('mapGitHubRepo', () => {
  it('maps a classic repo record', () => {
    expect(
      mapGitHubRepo(
        {
          name: 'repo',
          full_name: 'owner/repo',
          private: true,
          clone_url: 'https://github.com/owner/repo.git',
          ssh_url: 'git@github.com:owner/repo.git',
          html_url: 'https://github.com/owner/repo',
          default_branch: 'main',
          pushed_at: '2026-01-02T03:04:05Z',
          description: 'A thing'
        },
        'acct-1'
      )
    ).toEqual({
      accountId: 'acct-1',
      fullName: 'owner/repo',
      name: 'repo',
      isPrivate: true,
      cloneUrl: 'https://github.com/owner/repo.git',
      sshUrl: 'git@github.com:owner/repo.git',
      webUrl: 'https://github.com/owner/repo',
      defaultBranch: 'main',
      pushedAt: '2026-01-02T03:04:05Z',
      description: 'A thing'
    })
  })

  it('treats visibility:private as private without the classic flag', () => {
    const mapped = mapGitHubRepo(
      {
        full_name: 'o/r',
        private: false,
        visibility: 'private',
        clone_url: 'https://github.com/o/r.git'
      },
      'a'
    )
    expect(mapped?.isPrivate).toBe(true)
    // No html_url → the clone URL without the .git suffix is a fine web URL.
    expect(mapped?.webUrl).toBe('https://github.com/o/r')
  })

  it('skips records missing the identity or the clone URL', () => {
    expect(mapGitHubRepo({ full_name: 'o/r' }, 'a')).toBeNull()
    expect(mapGitHubRepo({ clone_url: 'x' }, 'a')).toBeNull()
    expect(mapGitHubRepo(null, 'a')).toBeNull()
  })
})

describe('mapGitHubRepoPage', () => {
  const two = [
    { full_name: 'a/one', clone_url: 'https://github.com/a/one.git' },
    { full_name: 'a/two', clone_url: 'https://github.com/a/two.git' }
  ]

  it('offers the next page when the page came back full', () => {
    const page = mapGitHubRepoPage(two, 'acct', 1, 2)
    expect(page.items).toHaveLength(2)
    expect(page.nextCursor).toBe('2')
  })

  it('stops when the page came back short, and never from junk bodies', () => {
    expect(mapGitHubRepoPage(two, 'acct', 3, 50).nextCursor).toBeNull()
    const broken = mapGitHubRepoPage({ message: 'sad' }, 'acct', 1, 10)
    expect(broken.items).toEqual([])
    expect(broken.nextCursor).toBeNull()
  })
})

describe('normalizeGitLabApiBase', () => {
  it('defaults to gitlab.com and keeps an instance root', () => {
    expect(normalizeGitLabApiBase(undefined)).toBe('https://gitlab.com')
    expect(normalizeGitLabApiBase('gitlab.example.com')).toBe('https://gitlab.example.com')
    expect(normalizeGitLabApiBase('https://gitlab.example.com/api/v4/')).toBe(
      'https://gitlab.example.com'
    )
    expect(normalizeGitLabApiBase('https://gitlab.example.com/')).toBe(
      'https://gitlab.example.com'
    )
  })
})

describe('mapGitLabIdentity', () => {
  it('reads username/name with the login fallback', () => {
    expect(mapGitLabIdentity({ username: 'gituser', name: 'Git User' })).toEqual({
      login: 'gituser',
      displayName: 'Git User',
      avatarUrl: null
    })
    expect(mapGitLabIdentity({ name: 'no username' })).toBeNull()
  })
})

describe('mapGitLabProject', () => {
  it('maps a project record and treats internal as private', () => {
    expect(
      mapGitLabProject(
        {
          id: 1,
          name: 'Project',
          path: 'project',
          path_with_namespace: 'group/sub/project',
          visibility: 'internal',
          http_url_to_repo: 'https://gitlab.example.com/group/sub/project.git',
          ssh_url_to_repo: 'git@gitlab.example.com:group/sub/project.git',
          web_url: 'https://gitlab.example.com/group/sub/project',
          default_branch: 'main',
          last_activity_at: '2026-05-01T00:00:00.000Z',
          description: 'Hi'
        },
        'acct'
      )
    ).toEqual({
      accountId: 'acct',
      fullName: 'group/sub/project',
      name: 'project',
      isPrivate: true,
      cloneUrl: 'https://gitlab.example.com/group/sub/project.git',
      sshUrl: 'git@gitlab.example.com:group/sub/project.git',
      webUrl: 'https://gitlab.example.com/group/sub/project',
      defaultBranch: 'main',
      pushedAt: '2026-05-01T00:00:00.000Z',
      description: 'Hi'
    })
    expect(
      mapGitLabProject(
        {
          path_with_namespace: 'g/p',
          visibility: 'public',
          http_url_to_repo: 'https://x/g/p.git'
        },
        'acct'
      )?.isPrivate
    ).toBe(false)
    expect(mapGitLabProject({ name: 'no path' }, 'a')).toBeNull()
  })
})

describe('mapGitLabRepoPage', () => {
  const one = [
    {
      path_with_namespace: 'g/p',
      http_url_to_repo: 'https://gitlab.com/g/p.git',
      visibility: 'public'
    }
  ]

  it('carries X-Next-Page through as the cursor', () => {
    const page = mapGitLabRepoPage(one, 'a', new Headers({ 'x-next-page': '3' }))
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toBe('3')
  })

  it('ends at the last page (empty header) and survives junk', () => {
    expect(
      mapGitLabRepoPage(one, 'a', new Headers({ 'x-next-page': '' })).nextCursor
    ).toBeNull()
    expect(mapGitLabRepoPage({}, 'a', new Headers()).items).toEqual([])
  })
})
