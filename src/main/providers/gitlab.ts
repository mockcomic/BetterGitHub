import type { AccountAuthKind, RemoteRepoPage, RemoteRepository } from '../../shared/models'
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
  }
}
