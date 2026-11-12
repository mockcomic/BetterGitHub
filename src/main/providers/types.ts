import type {
  AccountAuthKind,
  AccountInfo,
  CreateRepoRequest,
  ProviderOwner,
  RemoteRepoPage,
  RemoteRepository,
  RemoteRepoSort
} from '../../shared/models'

/** Identity returned by a provider when a token is validated. */
export interface ProviderIdentity {
  readonly login: string
  readonly displayName: string
  readonly avatarUrl: string | null
}

/**
 * One page request against a hosted provider. `cursor` is whatever the
 * previous page returned (provider page number); null starts fresh.
 * `search` is applied provider-side where the API supports it (GitHub's
 * Search API, GitLab's `?search=`) — the list view always re-filters
 * loaded items client-side too.
 */
export interface RepoPageRequest {
  readonly search: string
  readonly cursor: string | null
  readonly perPage: number
  /** Server-side ordering where the provider supports one. */
  readonly sort?: RemoteRepoSort
}

/** The hosted-API surface Aspen needs from every provider. */
export interface ProviderClient {
  /** Validate a credential against the provider's `/user` endpoint. */
  validate(apiBase: string, token: string, authKind: AccountAuthKind): Promise<ProviderIdentity>
  listRepos(
    apiBase: string,
    account: Pick<AccountInfo, 'id' | 'login'>,
    token: string,
    authKind: AccountAuthKind,
    request: RepoPageRequest
  ): Promise<RemoteRepoPage>
  /**
   * Where the account may create a repository: itself plus the
   * organizations/groups its token reaches. Powers the publish owner picker.
   */
  listOwners(
    apiBase: string,
    account: Pick<AccountInfo, 'id' | 'login'>,
    token: string,
    authKind: AccountAuthKind
  ): Promise<ProviderOwner[]>
  /**
   * Create a repository under `request.owner`. The result carries the new
   * repo's clone/web URLs so the publish flow can wire up `origin` without
   * guessing them. A token without write scope fails with the provider's
   * own (403-flavored) message.
   */
  createRepo(
    apiBase: string,
    account: Pick<AccountInfo, 'id' | 'login'>,
    token: string,
    authKind: AccountAuthKind,
    request: CreateRepoRequest
  ): Promise<RemoteRepository>
  /**
   * Fork `<parentFullName>` into the account's own namespace and return the
   * fork once the provider has finished making it — a push may follow
   * immediately. GitHub creates forks asynchronously (202 + polling); the
   * call resolves only when the fork's API record is readable. Providers
   * without an in-app fork story throw one clear, actionable message.
   */
  forkRepo(
    apiBase: string,
    account: Pick<AccountInfo, 'id' | 'login'>,
    token: string,
    authKind: AccountAuthKind,
    parentFullName: string
  ): Promise<RemoteRepository>
}
