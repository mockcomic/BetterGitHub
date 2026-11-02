import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type {
  AccountInfo,
  AccountProvider,
  RemoteRepository,
  RemoteRepoSort
} from '../../../shared/models'
import { call } from '../api'
import { useStore, useStoreState } from '../store'
import { relativeTime } from '../time'

/**
 * Shared hosted-account UI: the settings rows, the sign-in panel (browser
 * flows + token fallback), and the clone dialog's account repository pane.
 * Tokens never appear here — only logins, badges, and one-way inputs.
 */

const TOKEN_PAGES: Record<AccountProvider, string> = {
  github: 'https://github.com/settings/tokens',
  gitlab: 'https://gitlab.com/-/user_settings/personal_access_tokens'
}

function providerLabel(account: Pick<AccountInfo, 'provider' | 'apiBase'>): string {
  if (account.provider === 'github') return 'GitHub'
  return 'GitLab'
}

/** 'github.com' for cloud, the instance host for self-hosted. */
function instanceLabel(account: AccountInfo): string | null {
  const cloud =
    account.provider === 'github'
      ? ['api.github.com', 'github.com', 'www.github.com']
      : ['gitlab.com']
  try {
    const host = new URL(account.apiBase).hostname.toLowerCase()
    return cloud.includes(host) ? null : host
  } catch {
    return account.apiBase
  }
}

/** The account's profile page on the provider's site, when derivable. */
function profileUrl(account: AccountInfo): string | null {
  try {
    const url = new URL(account.apiBase)
    if (account.provider === 'github') {
      // The stored apiBase is the REST root; profiles live on the site.
      if (url.hostname.toLowerCase() === 'api.github.com') {
        return `https://github.com/${encodeURIComponent(account.login)}`
      }
      const root = url.origin + url.pathname.replace(/\/+$/, '').replace(/\/api\/v3$/i, '')
      return `${root}/${encodeURIComponent(account.login)}`
    }
    return `${url.origin}/${encodeURIComponent(account.login)}`
  } catch {
    return null
  }
}

function initials(name: string): string {
  const cleaned = name.trim()
  if (cleaned.length === 0) return '?'
  const parts = cleaned.split(/[\s._\-/]+/).filter(p => p.length > 0)
  const first = parts[0][0]
  const second = parts.length > 1 ? parts[1][0] : ''
  return (first + second).toUpperCase()
}

/**
 * The account's real avatar once main has fetched it (as a data: URL —
 * the CSP never needs a remote image source); the initials circle is the
 * loading and unavailable state.
 */
function AccountAvatar({ account }: { account: AccountInfo }): JSX.Element {
  const state = useStoreState()
  const src = state.avatars[account.id]
  if (typeof src === 'string') {
    return <img className="account-avatar" src={src} alt="" draggable={false} />
  }
  return (
    <span className="account-avatar" aria-hidden="true">
      {initials(account.displayName || account.login)}
    </span>
  )
}

/** The signed-accounts rows in Preferences → Accounts. */
export function AccountList(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const accounts = state.accounts

  if (accounts.length === 0) {
    return (
      <p className="accounts-empty">
        No accounts yet — sign in below to browse and clone your repositories.
      </p>
    )
  }
  return (
    <div className="account-list">
      {accounts.map(account => {
        const instance = instanceLabel(account)
        const profile = profileUrl(account)
        return (
          <div className="account-row" key={account.id}>
            <AccountAvatar account={account} />
            <span className="account-who">
              <span className="account-name">
                {account.displayName || account.login}
              </span>
              <span className="account-sub mono">
                @{account.login} · {providerLabel(account)}
                {instance !== null ? ` · ${instance}` : ''}
              </span>
            </span>
            {profile !== null && (
              <button
                className="mini link"
                title={`Open ${account.login} on ${providerLabel(account)}`}
                onClick={() => void call('openExternal', profile)}
              >
                Profile
              </button>
            )}
            <span className="account-chip">{account.authKind === 'pat' ? 'Token' : 'Browser'}</span>
            <button
              className="mini danger"
              onClick={() => void store.signOut(account.id)}
              title="Remove the account and delete its stored token"
            >
              Sign out
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Sign-in panel: browser buttons when client ids are configured, and the
 * token form that works everywhere (self-hosted included). Pending browser
 * sign-ins render their waiting state here; polling lives in the store so
 * closing the dialog never strands the flow.
 */
export function SignInPanel({
  onSuccess
}: {
  onSuccess?: (account: AccountInfo) => void
}): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const [provider, setProvider] = useState<AccountProvider>('github')
  const [token, setToken] = useState('')
  const [instance, setInstance] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const support = state.settings?.accounts
  const challenge = state.signIn
  const error = state.signInError

  useEffect(() => {
    // A completed or failed sign-in (by the store's poller) clears the
    // panel's transient notice so the error/success line owns the space.
    if (challenge === null) return
    setNotice(null)
  }, [challenge])

  const startBrowser = (which: AccountProvider): void => {
    setNotice(null)
    // The optional instance line doubles as the enterprise/self-hosted
    // root for both providers' browser flows.
    const trimmed = instance.trim()
    void store.startBrowserSignIn(which, trimmed.length > 0 ? trimmed : undefined)
  }

  const submitToken = (): void => {
    if (token.trim().length === 0) return
    setBusy(true)
    setNotice(null)
    void store
      .signInWithToken(provider, token, instance)
      .then(result => {
        setNotice(result.message)
        if (result.ok) {
          setToken('')
          if (result.account !== null) onSuccess?.(result.account)
        }
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className="signin-panel">
      {challenge === null ? (
        <>
          <div className="signin-browser">
            <button
              className="btn"
              disabled={support ? !support.hasGitHubClientId : true}
              onClick={() => startBrowser('github')}
              title={
                support && !support.hasGitHubClientId
                  ? 'Needs an OAuth App client id (Device Flow enabled, callback http://127.0.0.1:8765/callback) in Browser sign-in apps below — or use a token.'
                  : 'Sign in in your browser (GitHub authorization); falls back to the one-time code if the local port is busy.'
              }
            >
              Sign in with GitHub
            </button>
            <button
              className="btn"
              disabled={support ? !support.hasGitLabClientId : true}
              onClick={() => startBrowser('gitlab')}
              title={
                support && !support.hasGitLabClientId
                  ? 'Needs an application id (redirect http://127.0.0.1:8765/callback) in Browser sign-in apps below — or use a token.'
                  : 'GitLab OAuth with PKCE; the instance is the URL below when you fill it in.'
              }
            >
              Sign in with GitLab
            </button>
          </div>
          {error !== null && <p className="signin-error">{error}</p>}
          {notice !== null && <p className="signin-notice">{notice}</p>}
        </>
      ) : (
        <BrowserSignInProgress
          onCopy={async (text: string): Promise<void> => {
            await call('writeClipboard', text)
            setNotice('Code copied.')
          }}
        />
      )}

      {challenge === null && (
        <div className="signin-token">
          <div className="row">
            <select
              className="signin-provider"
              value={provider}
              onChange={e => setProvider(e.target.value === 'gitlab' ? 'gitlab' : 'github')}
              aria-label="Provider"
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
            </select>
            <input
              className="signin-token-input"
              type="password"
              placeholder="Personal access token"
              value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitToken()
              }}
            />
            <button
              className="btn primary"
              disabled={busy || token.trim().length === 0}
              onClick={submitToken}
            >
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          </div>
          <input
            className="signin-instance"
            placeholder={
              provider === 'github'
                ? 'Enterprise base URL (optional) — e.g. github.corp.example.com'
                : 'Self-hosted instance (optional) — e.g. gitlab.example.com'
            }
            value={instance}
            onChange={e => setInstance(e.target.value)}
          />
          <span className="field-hint">
            Scopes: GitHub classic needs <code>repo</code> (fine-grained: contents read);{' '}
            GitLab needs <code>read_api</code> + <code>read_user</code>.{' '}
            <button
              className="mini link"
              onClick={() => void call('openExternal', TOKEN_PAGES[provider])}
            >
              Create a {providerLabel({ provider, apiBase: '' })} token
            </button>
          </span>
        </div>
      )}
    </div>
  )
}

function BrowserSignInProgress({
  onCopy
}: {
  onCopy: (text: string) => Promise<void>
}): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const challenge = state.signIn
  if (challenge === null) return <></>
  if (challenge.kind === 'github-device') {
    return (
      <div className="signin-progress">
        <p className="signin-progress-line">
          Enter this code at{' '}
          <button
            className="mini link"
            onClick={() => void call('openExternal', challenge.verificationUrl)}
          >
            github.com/login/device
          </button>
          :
        </p>
        <div className="signin-code-row">
          <code className="signin-code">{challenge.userCode}</code>
          <button className="mini" onClick={() => void onCopy(challenge.userCode)}>
            Copy
          </button>
        </div>
        <p className="signin-waiting">
          <span className="spinner" /> Waiting for you to approve the request…
        </p>
        <p>
          <button className="mini" onClick={() => store.cancelBrowserSignIn()}>
            Cancel sign-in
          </button>
        </p>
      </div>
    )
  }
  return (
    <div className="signin-progress">
      <p className="signin-progress-line">
        <button
          className="mini link"
          onClick={() => void call('openExternal', challenge.authorizeUrl)}
        >
          Continue in your browser
        </button>{' '}
        — Aspen is listening on 127.0.0.1 for the redirect.
      </p>
      <p className="signin-waiting">
        <span className="spinner" /> Waiting for you to approve the request…
      </p>
      <p className="signin-progress-alt">
        {challenge.kind === 'github-browser' && (
          <button
            className="mini"
            title="Use GitHub's device-code flow instead (no local callback port needed)"
            onClick={() => void store.startBrowserSignIn('github', undefined, 'device')}
          >
            Use the one-time code instead
          </button>
        )}{' '}
        <button className="mini" onClick={() => store.cancelBrowserSignIn()}>
          Cancel sign-in
        </button>
      </p>
    </div>
  )
}

/** One pane of the clone dialog: an account's hosted repositories. */
export interface RepoPaneState {
  readonly items: ReadonlyArray<RemoteRepository>
  readonly nextCursor: string | null
  readonly loading: boolean
  readonly error: string | null
}

export const EMPTY_PANE: RepoPaneState = {
  items: [],
  nextCursor: null,
  loading: false,
  error: null
}

type VisibilityFilter = 'all' | 'public' | 'private'

const SORT_LABELS: ReadonlyArray<{ value: RemoteRepoSort; label: string }> = [
  { value: 'pushed', label: 'Most recent activity' },
  { value: 'created', label: 'Recently created' },
  { value: 'name', label: 'Name A–Z' }
]

export function RemoteRepoPane({
  account,
  pane,
  search,
  onSearch,
  sort,
  onSort,
  onRefresh,
  onLoadMore,
  onPick,
  pickedCloneUrl
}: {
  account: AccountInfo
  pane: RepoPaneState
  search: string
  onSearch: (value: string) => void
  sort: RemoteRepoSort
  onSort: (value: RemoteRepoSort) => void
  onRefresh: () => void
  onLoadMore: () => void
  onPick: (repo: RemoteRepository) => void
  pickedCloneUrl: string
}): JSX.Element {
  const [visibility, setVisibility] = useState<VisibilityFilter>('all')
  const needle = search.trim().toLowerCase()
  // Search is applied provider-side for both hosts (GitHub via the Search
  // API, GitLab via ?search=); this re-filter is instant and free — it also
  // covers description matches and partial keystrokes mid-debounce.
  const visible = pane.items.filter(r => {
    if (visibility === 'public' && r.isPrivate) return false
    if (visibility === 'private' && !r.isPrivate) return false
    return (
      needle.length === 0 ||
      r.fullName.toLowerCase().includes(needle) ||
      (r.description ?? '').toLowerCase().includes(needle)
    )
  })

  return (
    <div className="remote-pane">
      <div className="remote-toolbar">
        <input
          className="remote-search"
          placeholder={`Search ${providerLabel(account)} repositories`}
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
        <span className="repo-filter-chips" role="group" aria-label="Filter by visibility">
          {(['all', 'public', 'private'] as const).map(value => (
            <button
              key={value}
              className={`chip-toggle${visibility === value ? ' active' : ''}`}
              onClick={() => setVisibility(value)}
            >
              {value === 'all' ? 'All' : value === 'public' ? 'Public' : 'Private'}
            </button>
          ))}
        </span>
        {account.provider === 'github' && (
          <select
            className="remote-sort"
            value={sort}
            onChange={e => {
              const next = e.target.value
              if (next === 'pushed' || next === 'created' || next === 'name') onSort(next)
            }}
            aria-label="Sort repositories"
            title="Order the provider-side listing"
          >
            {SORT_LABELS.map(entry => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        )}
        <button
          className="btn"
          disabled={pane.loading}
          onClick={onRefresh}
          title="Reload this account's first page of repositories"
        >
          {pane.loading && pane.items.length === 0 ? <span className="spinner" /> : 'Refresh'}
        </button>
      </div>
      {pane.error !== null && <p className="remote-error">{pane.error}</p>}
      {pane.items.length === 0 && !pane.loading && pane.error === null && (
        <p className="remote-empty">
          {needle.length > 0 ? (
            <>No repositories matching “{search.trim()}” for @{account.login}.</>
          ) : (
            <>
              No repositories visible for @{account.login}. Fetch the first page with{' '}
              <strong>Refresh</strong>, or sign in with a token that has read access to all of
              your repositories.
            </>
          )}
        </p>
      )}
      <div className="remote-list" role="listbox" aria-label="Repositories">
        {visible.map(repo => (
          <button
            key={`${repo.accountId}:${repo.fullName}`}
            role="option"
            aria-selected={pickedCloneUrl === repo.cloneUrl}
            className={`remote-repo${pickedCloneUrl === repo.cloneUrl ? ' picked' : ''}`}
            title={repo.description ?? repo.webUrl}
            onClick={() => onPick(repo)}
          >
            <span className="remote-repo-name mono">
              <span className="remote-repo-owner">{repo.fullName.slice(0, repo.fullName.length - repo.name.length)}</span>
              <span className="remote-repo-leaf">{repo.name}</span>
            </span>
            {repo.isPrivate && <span className="repo-badge">private</span>}
            <span className="remote-repo-time">
              {repo.pushedAt === null ? '' : relativeTime(repo.pushedAt)}
            </span>
          </button>
        ))}
      </div>
      {pane.loading && pane.items.length > 0 && (
        <p className="remote-loading">
          <span className="spinner" /> loading…
        </p>
      )}
      {pane.nextCursor !== null && (
        <p>
          <button className="mini" disabled={pane.loading} onClick={onLoadMore}>
            Load more…
          </button>
        </p>
      )}
    </div>
  )
}
