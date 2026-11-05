import { describe, expect, it } from 'vitest'
import {
  buildGitHubCreateRepoBody,
  buildGitHubOwners,
  buildGitHubSearchQuery,
  githubListSortParams,
  githubRepoHost,
  githubSiteRoot,
  mapGitHubIdentity,
  mapGitHubRepo,
  mapGitHubRepoPage,
  mapGitHubSearchPage,
  normalizeGitHubApiBase
} from '../src/main/providers/github'
import {
  buildGitLabCreateRepoBody,
  gitLabNamespaceIdFor,
  mapGitLabIdentity,
  mapGitLabOwners,
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

describe('githubListSortParams', () => {
  it('maps each sort choice to GitHub parameters', () => {
    expect(githubListSortParams('pushed')).toBe('&sort=pushed&direction=desc')
    expect(githubListSortParams('created')).toBe('&sort=created&direction=desc')
    expect(githubListSortParams('name')).toBe('&sort=full-name&direction=asc')
    expect(githubListSortParams(undefined)).toBe('')
  })
})

describe('buildGitHubSearchQuery', () => {
  it('scopes to the user plus seen orgs and includes forks', () => {
    expect(buildGitHubSearchQuery('octo', ['github', 'octocat'], 'aspen git')).toBe(
      'aspen git org:github org:octocat user:octo fork:true'
    )
  })

  it('drops the login from the org list and caps orgs at five', () => {
    const many = ['octo', 'a', 'b', 'c', 'd', 'e', 'f']
    expect(buildGitHubSearchQuery('octo', many, 'x')).toBe(
      'x org:a org:b org:c org:d org:e user:octo fork:true'
    )
  })

  it('neutralizes query-syntax characters in the pasted text', () => {
    expect(buildGitHubSearchQuery('octo', [], '"quoted" -minus normal')).toBe(
      'quoted minus normal user:octo fork:true'
    )
  })
})

describe('mapGitHubSearchPage', () => {
  const body = {
    total_count: 2,
    items: [
      { full_name: 'a/one', clone_url: 'https://github.com/a/one.git' },
      { full_name: 'a/two', clone_url: 'https://github.com/a/two.git' }
    ]
  }

  it('maps the items array with the same full-page cursor rule', () => {
    const page = mapGitHubSearchPage(body, 'acct', 1, 2)
    expect(page.items).toHaveLength(2)
    expect(page.nextCursor).toBe('2')
    expect(mapGitHubSearchPage(body, 'acct', 1, 50).nextCursor).toBeNull()
  })

  it('survives bodies without an items array', () => {
    expect(mapGitHubSearchPage({ message: 'sad' }, 'acct', 1, 10).items).toEqual([])
    expect(mapGitHubSearchPage([1, 2], 'acct', 1, 10).items).toEqual([])
  })
})

describe('buildGitHubCreateRepoBody', () => {
  it('creates under the user when the owner is the account itself', () => {
    expect(
      buildGitHubCreateRepoBody('octo', {
        owner: 'octo',
        name: 'aspen',
        description: 'A git client',
        isPrivate: false
      })
    ).toEqual({ name: 'aspen', description: 'A git client', private: false })
  })

  it('matches logins case-insensitively and adds organization otherwise', () => {
    expect(
      buildGitHubCreateRepoBody('Octo', {
        owner: 'OCTO-CORP',
        name: 'aspen',
        description: '',
        isPrivate: true
      })
    ).toEqual({
      name: 'aspen',
      description: '',
      private: true,
      organization: 'OCTO-CORP'
    })
  })
})

describe('buildGitHubOwners', () => {
  it('leads with the account and maps the org list behind it', () => {
    expect(
      buildGitHubOwners('octo', [
        { login: 'octo-corp' },
        { login: 'aspen-org' },
        { id: 3 }
      ])
    ).toEqual([
      { name: 'octo', displayName: 'octo', kind: 'user' },
      { name: 'octo-corp', displayName: 'octo-corp', kind: 'organization' },
      { name: 'aspen-org', displayName: 'aspen-org', kind: 'organization' }
    ])
  })

  it('never lists the account twice and survives junk bodies', () => {
    expect(buildGitHubOwners('octo', [{ login: 'octo' }, null, 'x'])).toEqual([
      { name: 'octo', displayName: 'octo', kind: 'user' }
    ])
    expect(buildGitHubOwners('octo', {})).toEqual([
      { name: 'octo', displayName: 'octo', kind: 'user' }
    ])
  })
})

describe('mapGitLabOwners', () => {
  it('maps namespaces with full_path, kind and name fallback', () => {
    expect(
      mapGitLabOwners([
        { id: 1, name: 'Git User', path: 'gituser', full_path: 'gituser', kind: 'user' },
        { id: 2, name: 'Eng', path: 'eng', full_path: 'corp/eng', kind: 'group' },
        { id: 3, path: 'bare', kind: 'group' },
        { id: 4 }
      ])
    ).toEqual([
      { name: 'gituser', displayName: 'Git User', kind: 'user' },
      { name: 'corp/eng', displayName: 'Eng', kind: 'group' },
      { name: 'bare', displayName: 'bare', kind: 'group' }
    ])
  })

  it('returns nothing for bodies that are not arrays', () => {
    expect(mapGitLabOwners({ message: 'sad' })).toEqual([])
  })
})

describe('gitLabNamespaceIdFor', () => {
  const body = [
    { id: 1, path: 'gituser', full_path: 'gituser', kind: 'user' },
    { id: 2, path: 'eng', full_path: 'corp/eng', kind: 'group' }
  ]

  it('returns null when the owner is the account (GitLab defaults to it)', () => {
    expect(gitLabNamespaceIdFor('gituser', body, 'gituser')).toBeNull()
    expect(gitLabNamespaceIdFor('gituser', body, 'GitUser')).toBeNull()
    expect(gitLabNamespaceIdFor('gituser', body, '  ')).toBeNull()
  })

  it('resolves group paths case-insensitively', () => {
    expect(gitLabNamespaceIdFor('gituser', body, 'CORP/Eng')).toBe(2)
  })

  it('answers null for an owner the token cannot create into', () => {
    expect(gitLabNamespaceIdFor('gituser', body, 'someone-else')).toBeNull()
    expect(gitLabNamespaceIdFor('gituser', 'junk', 'corp/eng')).toBeNull()
  })
})

describe('buildGitLabCreateRepoBody', () => {
  it('promises the strictest visibility for a private toggle', () => {
    expect(
      buildGitLabCreateRepoBody(
        { owner: 'gituser', name: 'aspen', description: '', isPrivate: true },
        null
      )
    ).toEqual({ name: 'aspen', description: '', visibility: 'private' })
    expect(
      buildGitLabCreateRepoBody(
        { owner: 'gituser', name: 'aspen', description: 'hi', isPrivate: false },
        null
      )
    ).toEqual({ name: 'aspen', description: 'hi', visibility: 'public' })
  })

  it('targets the resolved namespace when one was needed', () => {
    expect(
      buildGitLabCreateRepoBody(
        { owner: 'corp/eng', name: 'aspen', description: '', isPrivate: false },
        42
      )
    ).toEqual({
      name: 'aspen',
      description: '',
      visibility: 'public',
      namespace_id: 42
    })
  })
})
