import type {
  AccountAuthKind,
  AccountInfo,
  RemoteRepoPage
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
 * Providers that cannot server-side filter simply ignore `search` — the
 * list view always re-filters loaded items client-side.
 */
export interface RepoPageRequest {
  readonly search: string
  readonly cursor: string | null
  readonly perPage: number
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
}
