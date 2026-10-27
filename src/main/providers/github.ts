import type { RemoteRepoPage, RemoteRepository } from '../../shared/models'
import {
  apiFetch,
  bool,
  providerErrorMessage,
  ProviderHttpError,
  str,
  type ApiResponse
} from './http'
import type { ProviderClient, ProviderIdentity, RepoPageRequest } from './types'

/**
 * GitHub REST client for account browsing. One page of `/user/repos` per
 * call (GitHub has no search parameter there); the list view filters loaded
 * items client-side, so `search` is accepted and ignored rather than
 * reaching the separately rate-limited Search API.
 */

export const GITHUB_COM_API = 'https://api.github.com'

/**
 * Normalize whatever the user pastes (host, web URL, API root) to a REST
 * root. github.com maps to api.github.com; any other host gets `/api/v3`
 * appended when not already present (GitHub Enterprise's REST root).
 */
export function normalizeGitHubApiBase(raw: string | undefined): string {
  const value =
    raw === undefined || raw.trim().length === 0
      ? GITHUB_COM_API
      : raw.trim().replace(/\/+$/, '')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  const url = new URL(withScheme)
  const host = url.hostname.toLowerCase()
  const path = url.pathname.replace(/\/+$/, '')
  if (host === 'www.github.com' || host === 'github.com') return GITHUB_COM_API
  if (host === 'api.github.com') return GITHUB_COM_API
  if (/\/api\/v3$/i.test(path)) return `${url.origin}${path}`
  return `${url.origin}/api/v3`
}

/** Host a git remote/clone URL for this account uses (for the auth retry). */
export function githubRepoHost(apiBase: string): string {
  const host = new URL(apiBase).hostname.toLowerCase()
  return host === 'api.github.com' ? 'github.com' : host
}

/** A site root for GitHub's device endpoints (api.github.com → github.com). */
export function githubSiteRoot(apiBase: string): string {
  if (apiBase === GITHUB_COM_API) return 'https://github.com'
  return new URL(apiBase).origin
}

export function mapGitHubIdentity(
  json: Record<string, unknown>
): ProviderIdentity | null {
  const login = str(json.login)
  if (login === null) return null
  return {
    login,
    displayName: str(json.name) ?? login,
    avatarUrl: str(json.avatar_url)
  }
}

export function mapGitHubRepo(
  value: unknown,
  accountId: string
): RemoteRepository | null {
  if (value === null || typeof value !== 'object') return null
  const json = value as Record<string, unknown>
  const fullName = str(json.full_name)
  const cloneUrl = str(json.clone_url)
  if (fullName === null || cloneUrl === null) return null
  return {
    accountId,
    fullName,
    name: str(json.name) ?? fullName.split('/').pop() ?? fullName,
    // `private` is the classic field; `visibility` is its string successor.
    isPrivate: bool(json.private) || json.visibility === 'private',
    cloneUrl,
    sshUrl: str(json.ssh_url),
    webUrl: str(json.html_url) ?? cloneUrl.replace(/\.git$/i, ''),
    defaultBranch: str(json.default_branch),
    pushedAt: str(json.pushed_at),
    description: str(json.description)
  }
}

export function mapGitHubRepoPage(
  body: unknown,
  accountId: string,
  page: number,
  perPage: number
): RemoteRepoPage {
  const items: RemoteRepository[] = []
  if (Array.isArray(body)) {
    for (const value of body) {
      const mapped = mapGitHubRepo(value, accountId)
      if (mapped !== null) items.push(mapped)
    }
  }
  return {
    items,
    // GitHub has no cursor: a full page means "ask for the next number".
    nextCursor: items.length === perPage ? String(page + 1) : null
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${token}`
  }
}

function fail(res: ApiResponse): never {
  throw new ProviderHttpError(res.status, providerErrorMessage('GitHub', res))
}

export const githubClient: ProviderClient = {
  async validate(apiBase, token) {
    const res = await apiFetch(`${apiBase}/user`, { headers: authHeaders(token) })
    if (!res.ok) fail(res)
    const identity = mapGitHubIdentity(res.json)
    if (identity === null) {
      throw new Error('GitHub returned an unreadable user record for this token.')
    }
    return identity
  },

  async listRepos(apiBase, account, token, _authKind, request: RepoPageRequest) {
    const page = Math.max(1, Number.parseInt(request.cursor ?? '1', 10) || 1)
    const perPage = Math.min(100, Math.max(1, request.perPage))
    const url =
      `${apiBase}/user/repos` +
      `?affiliation=owner,collaborator,organization_member` +
      `&per_page=${perPage}&page=${page}`
    const res = await apiFetch(url, { headers: authHeaders(token) })
    if (!res.ok) fail(res)
    return mapGitHubRepoPage(res.json, account.id, page, perPage)
  }
}
