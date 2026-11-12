import type {
  CreateRepoRequest,
  ProviderOwner,
  RemoteRepoPage,
  RemoteRepoSort,
  RemoteRepository
} from '../../shared/models'
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
 * GitHub REST client for account browsing.
 *
 * Without a search term this pages `/user/repos` (GitHub has no text
 * parameter there) and honors `sort`. With a search term it switches to the
 * Search API — `user:{login}` plus `org:` clauses for every owner seen in
 * previously loaded pages, so organization repositories are findable too.
 * The Search API has its own rate limit; a refused call surfaces as a
 * friendly error and the list view still filters loaded items client-side.
 */

export const GITHUB_COM_API = 'https://api.github.com'

/** Org owners learned from /user/repos pages, per account (search scoping). */
const seenOwners = new Map<string, Set<string>>()

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

/** A site root for GitHub's OAuth endpoints (api.github.com → github.com). */
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

function mapRepoArray(
  values: unknown,
  accountId: string
): RemoteRepository[] {
  const items: RemoteRepository[] = []
  if (Array.isArray(values)) {
    for (const value of values) {
      const mapped = mapGitHubRepo(value, accountId)
      if (mapped !== null) items.push(mapped)
    }
  }
  return items
}

export function mapGitHubRepoPage(
  body: unknown,
  accountId: string,
  page: number,
  perPage: number
): RemoteRepoPage {
  const items = mapRepoArray(body, accountId)
  // GitHub has no cursor: a full page means "ask for the next number".
  return {
    items,
    nextCursor: items.length === perPage ? String(page + 1) : null
  }
}

/** A Search API page: same repo schema under `items`, same paging rule. */
export function mapGitHubSearchPage(
  body: unknown,
  accountId: string,
  page: number,
  perPage: number
): RemoteRepoPage {
  const items =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? mapRepoArray((body as Record<string, unknown>).items, accountId)
      : []
  return {
    items,
    nextCursor: items.length === perPage ? String(page + 1) : null
  }
}

/** The owner half of a `full_name`. */
function ownerOf(repo: Pick<RemoteRepository, 'fullName'>): string {
  const cut = repo.fullName.indexOf('/')
  return cut > 0 ? repo.fullName.slice(0, cut) : repo.fullName
}

function rememberOwners(
  accountId: string,
  login: string,
  items: ReadonlyArray<RemoteRepository>
): void {
  let owners = seenOwners.get(accountId)
  if (owners === undefined) {
    owners = new Set<string>()
    seenOwners.set(accountId, owners)
  }
  for (const repo of items) {
    const owner = ownerOf(repo)
    if (owner !== login) owners.add(owner)
  }
}

/** Query-syntax characters that would derail a pasted search term. */
function sanitizeSearch(text: string): string {
  return text
    .replace(/["\u201c\u201d]/g, ' ')
    .replace(/(^|\s)-/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The Search API query for an account: the user's own repositories plus any
 * organization already visible to them (max 5 orgs), forks included.
 */
export function buildGitHubSearchQuery(
  login: string,
  owners: Iterable<string>,
  text: string
): string {
  const cleaned = sanitizeSearch(text)
  const parts = [cleaned.length > 0 ? cleaned : '']
  for (const owner of owners) {
    if (owner === login) continue // covered by the user: qualifier
    if (parts.length >= 6) break // search text + ≤5 owner qualifiers
    parts.push(`org:${owner}`)
  }
  parts.push(`user:${login}`, 'fork:true')
  return parts.filter(p => p.length > 0).join(' ')
}

/** The `sort`/`direction` pair for /user/repos, or none for provider default. */
export function githubListSortParams(sort: RemoteRepoSort | undefined): string {
  switch (sort) {
    case 'pushed':
      return '&sort=pushed&direction=desc'
    case 'created':
      return '&sort=created&direction=desc'
    case 'name':
      return '&sort=full-name&direction=asc'
    default:
      return ''
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${token}`
  }
}

/**
 * The POST /user/repos body for a create request. `organization` is added
 * only when the chosen owner is not the account itself — GitHub treats a
 * missing `organization` as "under the authenticated user".
 */
export function buildGitHubCreateRepoBody(
  login: string,
  request: CreateRepoRequest
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: request.name,
    description: request.description,
    private: request.isPrivate
  }
  if (ownerIsDifferent(login, request.owner)) body.organization = request.owner
  return body
}

/** The POST URL that forks `parentFullName` into the caller's namespace. */
export function githubForkUrl(apiBase: string, parentFullName: string): string {
  const encoded = parentFullName
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
  return `${apiBase}/repos/${encoded}/forks`
}

/** The GET URL of a repository's API record (fork readiness polling). */
export function githubRepoUrl(apiBase: string, fullName: string): string {
  const encoded = fullName
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
  return `${apiBase}/repos/${encoded}`
}

/**
 * A personal fork always keeps the parent's repository name; that lets the
 * fork flow know the fork's full name (and a good web URL for errors) even
 * when GitHub's 202 body is sparse.
 */
export function expectedForkFullName(login: string, parentFullName: string): string {
  const parentName = parentFullName.split('/').pop() ?? parentFullName
  return `${login}/${parentName}`
}

/** Everything fork readiness polling takes from its environment. */
export interface ForkPollingDeps {
  readonly fetchJson: (url: string, init?: RequestInit) => Promise<ApiResponse>
  readonly sleep: (ms: number) => Promise<void>
  readonly deadlineMs: number
  readonly intervalMs: number
}

/**
 * Poll `GET /repos/{forkFullName}` until the fork's record reads back as a
 * repository — GitHub answers the POST with 202 while the copy is still
 * being made, and a push must not race that. The fresh record (with the
 * fork's real default branch and URLs) is what the caller gets. A 404 keeps
 * the loop waiting; any other failure surfaces as the provider's own
 * message; the deadline ends with a message naming the fork's page, because
 * the fork will exist — soon.
 */
export async function pollGitHubForkReady(
  deps: ForkPollingDeps,
  apiBase: string,
  token: string,
  accountId: string,
  forkFullName: string,
  fallbackWebUrl: string
): Promise<RemoteRepository> {
  const until = Date.now() + deps.deadlineMs
  let lastStatus = 0
  for (;;) {
    const res = await deps.fetchJson(githubRepoUrl(apiBase, forkFullName), {
      headers: authHeaders(token)
    })
    if (res.ok) {
      const fork = mapGitHubRepo(res.json, accountId)
      if (fork !== null) return fork
    } else if (res.status !== 404) {
      fail(res)
    }
    lastStatus = res.status
    if (Date.now() + deps.intervalMs > until) {
      throw new Error(
        `GitHub is still creating ${forkFullName} (HTTP ${lastStatus}). ` +
          `It will be ready at ${fallbackWebUrl} shortly — Push again once it is.`
      )
    }
    await deps.sleep(deps.intervalMs)
  }
}

const FORK_POLL_DEADLINE_MS = 60_000
const FORK_POLL_INTERVAL_MS = 1_000

const liveForkPollingDeps: ForkPollingDeps = {
  fetchJson: apiFetch,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  deadlineMs: FORK_POLL_DEADLINE_MS,
  intervalMs: FORK_POLL_INTERVAL_MS
}

/** True when the request should land somewhere other than the user's own space. */
function ownerIsDifferent(login: string, owner: string): boolean {
  // GitHub logins (users and orgs) are case-insensitive.
  return owner.trim().length > 0 && owner.trim().toLowerCase() !== login.toLowerCase()
}

/**
 * Map a GET /user/orgs array to organization owners. Entries without a login
 * are skipped rather than half-mapped; the account's own user entry is
 * prepended by the caller, so it never appears twice here.
 */
export function mapGitHubOrgOwners(body: unknown): ProviderOwner[] {
  const owners: ProviderOwner[] = []
  if (!Array.isArray(body)) return owners
  for (const value of body) {
    if (value === null || typeof value !== 'object') continue
    const login = str((value as Record<string, unknown>).login)
    if (login === null) continue
    owners.push({ name: login, displayName: login, kind: 'organization' })
  }
  return owners
}

/** The owner list for the publish picker: the account itself, then its orgs. */
export function buildGitHubOwners(
  login: string,
  orgsBody: unknown
): ProviderOwner[] {
  const owners: ProviderOwner[] = [
    { name: login, displayName: login, kind: 'user' }
  ]
  for (const org of mapGitHubOrgOwners(orgsBody)) {
    if (org.name.toLowerCase() === login.toLowerCase()) continue
    owners.push(org)
  }
  return owners
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
    const search = request.search.trim()
    if (search.length > 0) {
      // Remembered owners come from earlier /user/repos pages; the account
      // itself is always covered by `user:`.
      const owners = new Set<string>([account.login, ...(seenOwners.get(account.id) ?? [])])
      const query = buildGitHubSearchQuery(account.login, owners, search)
      const url =
        `${apiBase}/search/repositories` +
        `?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`
      const res = await apiFetch(url, { headers: authHeaders(token) })
      if (!res.ok) fail(res)
      rememberOwners(account.id, account.login, mapRepoArray((res.json as { items?: unknown }).items, account.id))
      return mapGitHubSearchPage(res.json, account.id, page, perPage)
    }
    const url =
      `${apiBase}/user/repos` +
      `?affiliation=owner,collaborator,organization_member` +
      `&per_page=${perPage}&page=${page}` +
      githubListSortParams(request.sort)
    const res = await apiFetch(url, { headers: authHeaders(token) })
    if (!res.ok) fail(res)
    const mapped = mapGitHubRepoPage(res.json, account.id, page, perPage)
    rememberOwners(account.id, account.login, mapped.items)
    return mapped
  },

  async listOwners(apiBase, account, token) {
    const res = await apiFetch(`${apiBase}/user/orgs?per_page=100`, {
      headers: authHeaders(token)
    })
    if (!res.ok) fail(res)
    return buildGitHubOwners(account.login, res.json)
  },

  async createRepo(apiBase, account, token, _authKind, request) {
    const res = await apiFetch(`${apiBase}/user/repos`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGitHubCreateRepoBody(account.login, request))
    })
    if (!res.ok) fail(res)
    const created = mapGitHubRepo(res.json, account.id)
    if (created === null) {
      throw new Error('GitHub created the repository but returned an unreadable record.')
    }
    return created
  },

  /**
   * Fork the parent under the account's own login and wait for GitHub to
   * finish making it (see pollGitHubForkReady). A fork that already exists
   * from an earlier day answers the POST with a refusal — when the account's
   * own record is verifiably that same fork, the flow converges on it
   * instead of erroring, so re-running the verb never dead-ends.
   */
  async forkRepo(apiBase, account, token, _authKind, parentFullName) {
    const segments = parentFullName.split('/').filter(s => s.length > 0)
    if (segments.length < 2) {
      throw new Error(`Not a repository path GitHub can fork: ${parentFullName}`)
    }
    const forkFullName = expectedForkFullName(account.login, parentFullName)
    const forkWebUrl = `${githubSiteRoot(apiBase)}/${forkFullName}`
    const res = await apiFetch(githubForkUrl(apiBase, parentFullName), {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: '{}'
    })
    if (res.ok) return pollGitHubForkReady(liveForkPollingDeps, apiBase, token, account.id, forkFullName, forkWebUrl)

    // Refused — GitHub answers "you already forked this" with a 403/409/422
    // on the POST. Accept only a record that really is this account's fork
    // of exactly this parent; anything else keeps the refusal message.
    const existingRes = await apiFetch(githubRepoUrl(apiBase, forkFullName), {
      headers: authHeaders(token)
    })
    if (existingRes.ok && isForkOf(existingRes.json, parentFullName)) {
      const existing = mapGitHubRepo(existingRes.json, account.id)
      if (existing !== null) {
        return pollGitHubForkReady(liveForkPollingDeps, apiBase, token, account.id, existing.fullName, existing.webUrl)
      }
    }
    fail(res)
  }
}

/**
 * True when a repository record is a fork whose parent is `parentFullName`
 * (case-insensitive, like every GitHub path comparison).
 */
function isForkOf(json: Record<string, unknown>, parentFullName: string): boolean {
  const parent = json.parent
  if (parent === null || typeof parent !== 'object') return false
  const parentRepo = str((parent as Record<string, unknown>).full_name)
  return (
    parentRepo !== null &&
    parentRepo.toLowerCase() === parentFullName.toLowerCase()
  )
}
