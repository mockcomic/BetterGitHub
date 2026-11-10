import type {
  AccountAuthKind,
  CreateRepoRequest,
  ProviderOwner,
  RemoteRepoPage,
  RemoteRepository
} from '../../shared/models'
import {
  apiFetch,
  providerErrorMessage,
  ProviderHttpError,
  str,
  type ApiResponse
} from './http'
import type { ProviderClient, ProviderIdentity, RepoPageRequest } from './types'

/**
 * GitLab REST client (v4) for account browsing, works against gitlab.com
 * and self-hosted instances alike. Search is a native parameter on
 * `/projects`, and `X-Next-Page` carries the cursor.
 */

export const GITLAB_COM = 'https://gitlab.com'

/**
 * Normalize a pasted instance reference to its site root (the API path
 * `/api/v4` is appended per call — an entered `/api/v4` suffix is stripped).
 */
export function normalizeGitLabApiBase(raw: string | undefined): string {
  const value =
    raw === undefined || raw.trim().length === 0
      ? GITLAB_COM
      : raw.trim().replace(/\/+$/, '')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  const url = new URL(withScheme)
  const path = url.pathname.replace(/\/+$/, '')
  const root = path.replace(/\/api\/v4$/i, '')
  return `${url.origin}${root}`
}

function authHeaders(token: string, authKind: AccountAuthKind): Record<string, string> {
  // A PAT goes in PRIVATE-TOKEN; a PKCE access token must go in the
  // OAuth2 Authorization header — GitLab rejects the wrong pairing.
  return authKind === 'pat'
    ? { 'PRIVATE-TOKEN': token }
    : { Authorization: `Bearer ${token}` }
}

export function mapGitLabIdentity(
  json: Record<string, unknown>
): ProviderIdentity | null {
  const login = str(json.username)
  if (login === null) return null
  return {
    login,
    displayName: str(json.name) ?? login,
    avatarUrl: str(json.avatar_url)
  }
}

export function mapGitLabProject(
  value: unknown,
  accountId: string
): RemoteRepository | null {
  if (value === null || typeof value !== 'object') return null
  const json = value as Record<string, unknown>
  const fullName = str(json.path_with_namespace)
  const cloneUrl = str(json.http_url_to_repo)
  if (fullName === null || cloneUrl === null) return null
  // `internal` is signed-in-only: private from Aspen's point of view.
  const isPrivate = str(json.visibility) !== 'public'
  return {
    accountId,
    fullName,
    name: str(json.path) ?? fullName.split('/').pop() ?? fullName,
    isPrivate,
    cloneUrl,
    sshUrl: str(json.ssh_url_to_repo),
    webUrl: str(json.web_url) ?? cloneUrl.replace(/\.git$/i, ''),
    defaultBranch: str(json.default_branch),
    pushedAt: str(json.last_activity_at),
    description: str(json.description)
  }
}

export function mapGitLabRepoPage(
  body: unknown,
  accountId: string,
  headers: Headers
): RemoteRepoPage {
  const items: RemoteRepository[] = []
  if (Array.isArray(body)) {
    for (const value of body) {
      const mapped = mapGitLabProject(value, accountId)
      if (mapped !== null) items.push(mapped)
    }
  }
  const next = str(headers.get('x-next-page'))
  return { items, nextCursor: next }
}

function fail(res: ApiResponse): never {
  throw new ProviderHttpError(res.status, providerErrorMessage('GitLab', res))
}

/**
 * Map a GET /api/v4/namespaces array (the user namespace + the groups the
 * user can create projects in) to owner entries. `full_path` carries the
 * group path; plain `path` is the fallback for older instances.
 */
export function mapGitLabOwners(body: unknown): ProviderOwner[] {
  const owners: ProviderOwner[] = []
  if (!Array.isArray(body)) return owners
  for (const value of body) {
    if (value === null || typeof value !== 'object') continue
    const json = value as Record<string, unknown>
    const path = str(json.full_path) ?? str(json.path)
    if (path === null) continue
    const kind = json.kind === 'group' ? 'group' : 'user'
    owners.push({ name: path, displayName: str(json.name) ?? path, kind })
  }
  return owners
}

/**
 * The namespace id a create request must target for `owner`, read from a
 * GET /api/v4/namespaces body; null when the owner is the account itself
 * (GitLab then defaults to the user's own namespace). A non-null request
 * whose owner is not in the body resolves to null too — the caller turns
 * that into the "you cannot create here" error.
 */
export function gitLabNamespaceIdFor(
  login: string,
  body: unknown,
  owner: string
): number | null {
  const wanted = owner.trim().toLowerCase()
  if (wanted.length === 0 || wanted === login.toLowerCase()) return null
  if (!Array.isArray(body)) return null
  for (const value of body) {
    if (value === null || typeof value !== 'object') continue
    const json = value as Record<string, unknown>
    const path = str(json.full_path) ?? str(json.path)
    if (path === null || path.toLowerCase() !== wanted) continue
    return typeof json.id === 'number' ? json.id : null
  }
  return null
}

/**
 * The POST /api/v4/projects body. Private maps to GitLab's strictest
 * `private` visibility (an `internal` project is signed-in-visible, which is
 * more public than the dialog's toggle promises). A `namespace_id` moves
 * the project out of the user's own space; omitting it creates under the
 * authenticated user.
 */
export function buildGitLabCreateRepoBody(
  request: CreateRepoRequest,
  namespaceId: number | null
): Record<string, unknown> {
  return {
    name: request.name,
    description: request.description,
    visibility: request.isPrivate ? 'private' : 'public',
    ...(namespaceId !== null ? { namespace_id: namespaceId } : {})
  }
}

export const gitlabClient: ProviderClient = {
  async validate(apiBase, token, authKind) {
    const res = await apiFetch(`${apiBase}/api/v4/user`, {
      headers: authHeaders(token, authKind)
    })
    if (!res.ok) fail(res)
    const identity = mapGitLabIdentity(res.json)
    if (identity === null) {
      throw new Error('GitLab returned an unreadable user record for this token.')
    }
    return identity
  },

  async listRepos(apiBase, account, token, authKind, request: RepoPageRequest) {
    const page = Math.max(1, Number.parseInt(request.cursor ?? '1', 10) || 1)
    const perPage = Math.min(100, Math.max(1, request.perPage))
    const params = new URLSearchParams({
      membership: 'true',
      order_by: 'last_activity_at',
      sort: 'desc',
      per_page: String(perPage),
      page: String(page)
    })
    if (request.search.length > 0) params.set('search', request.search)
    const res = await apiFetch(
      `${apiBase}/api/v4/projects?${params.toString()}`,
      { headers: authHeaders(token, authKind) }
    )
    if (!res.ok) fail(res)
    return mapGitLabRepoPage(res.json, account.id, res.headers)
  },

  async listOwners(apiBase, account, token, authKind) {
    const res = await apiFetch(`${apiBase}/api/v4/namespaces`, {
      headers: authHeaders(token, authKind)
    })
    if (!res.ok) fail(res)
    return mapGitLabOwners(res.json)
  },

  async createRepo(apiBase, account, token, authKind, request) {
    // A non-default owner must resolve to a namespace id the instance will
    // accept; /namespaces is exactly what this token may create into.
    let namespaceId: number | null = null
    const owner = request.owner.trim()
    if (owner.length > 0 && owner.toLowerCase() !== account.login.toLowerCase()) {
      const nsRes = await apiFetch(`${apiBase}/api/v4/namespaces`, {
        headers: authHeaders(token, authKind)
      })
      if (!nsRes.ok) fail(nsRes)
      namespaceId = gitLabNamespaceIdFor(account.login, nsRes.json, owner)
      if (namespaceId === null) {
        throw new Error(
          `GitLab will not let ${account.login} create a repository in ${owner} — pick another owner, or an account that is a member of that group.`
        )
      }
    }
    const res = await apiFetch(`${apiBase}/api/v4/projects`, {
      method: 'POST',
      headers: {
        ...authHeaders(token, authKind),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildGitLabCreateRepoBody(request, namespaceId))
    })
    if (!res.ok) fail(res)
    const created = mapGitLabProject(res.json, account.id)
    if (created === null) {
      throw new Error('GitLab created the project but returned an unreadable record.')
    }
    return created
  },

  /**
   * GitLab's fork API is a different shape again (project ids, fork status
   * polling, namespace choice) than the GitHub flow this app runs. Rather
   * than a half-fork, the app says so — and names the manual path that
   * already works with the rest of the app, since a hand-forked project
   * wired up as `origin` (with the parent as `upstream`) drives the same
   * create-pull-request URL builder.
   */
  async forkRepo(_apiBase, _account, _token, _authKind, parentFullName) {
    throw new Error(
      `Forking from the app is only supported for GitHub repositories. ` +
        `Fork ${parentFullName} on GitLab, then point this repository's origin at your fork.`
    )
  }
}
