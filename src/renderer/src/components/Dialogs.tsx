import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { call } from '../api'
import { useStore, useStoreState } from '../store'
import type { AccountInfo, ProviderOwner, RemoteRepoSort } from '../../../shared/models'
import type { ThemeId } from '../../../shared/themes'
import { isThemeId, THEME_ENTRIES } from '../../../shared/themes'
import { Dialog, Field, InfoTip } from './Dialog'
import { BranchDivergence, divergenceTitleSuffix } from './BranchBadges'
import { AccountList, EMPTY_PANE, RemoteRepoPane, SignInPanel, type RepoPaneState } from './AccountsUi'

import { DONATE_URL } from '../../../shared/links'
import { RELEASES_URL, type UpdateState } from '../../../shared/updates'

const autoEntries = THEME_ENTRIES.filter(e => e.group === 'auto')
const lightEntries = THEME_ENTRIES.filter(e => e.group === 'light')
const darkEntries = THEME_ENTRIES.filter(e => e.group === 'dark')

/** The preferences rail, in panel order. Accounts leads: it is the first
 *  thing a fresh install needs; the AI pointer note overrides on open. */
type SettingsSection = 'accounts' | 'ai' | 'appearance' | 'behavior'

const SECTION_ENTRIES: ReadonlyArray<{
  readonly id: SettingsSection
  readonly label: string
  readonly sub: string
}> = [
  { id: 'accounts', label: 'Accounts', sub: 'Providers, tokens, OAuth apps' },
  { id: 'ai', label: 'AI agent', sub: 'The endpoint behind ✨ Generate' },
  { id: 'appearance', label: 'Appearance', sub: 'Theme and palettes' },
  { id: 'behavior', label: 'Behavior', sub: 'Refresh, tips, updates' }
]

export function SettingsDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const settings = state.settings

  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [githubClientId, setGitHubClientId] = useState('')
  const [gitlabClientId, setGitLabClientId] = useState('')
  const [confirmOverride, setConfirmOverride] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [hintsEnabled, setHintsEnabled] = useState(true)
  const [autoUpdateChecks, setAutoUpdateChecks] = useState(true)
  const [theme, setTheme] = useState<ThemeId>('system')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [section, setSection] = useState<SettingsSection>('accounts')
  const [appsOpen, setAppsOpen] = useState(false)
  const navRefs = useRef<Partial<Record<SettingsSection, HTMLButtonElement | null>>>({})

  useEffect(() => {
    if (settings !== null && state.showSettings) {
      setBaseUrl(settings.ai.baseUrl)
      setModel(settings.ai.model)
      setCustomInstructions(settings.ai.customInstructions)
      setConfirmOverride(settings.confirmOverrideWithGeneratedMessage)
      setAutoRefresh(settings.autoRefresh)
      setHintsEnabled(settings.hintsEnabled)
      setAutoUpdateChecks(settings.autoUpdateChecks)
      setTheme(settings.theme)
      setApiKey('')
      setGitHubClientId('')
      setGitLabClientId('')
      setTestResult(null)
      // Land where the visitor came for: the AI pointer note opens the AI
      // rail item. The sign-in-apps drawer stays closed by default — an
      // unconfigured browser button now explains itself by opening the
      // one-step setup right in the sign-in panel, so nothing here has to
      // pre-emptively apologise for a greyed button.
      setSection(state.settingsAiNote ? 'ai' : 'accounts')
      setAppsOpen(false)
    }
  }, [settings, state.showSettings, state.settingsAiNote])

  if (!state.showSettings || settings === null) return null

  const selectSection = (next: SettingsSection): void => setSection(next)

  const onNavKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const idx = SECTION_ENTRIES.findIndex(s => s.id === section)
    let next = -1
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      next = (idx + 1) % SECTION_ENTRIES.length
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      next = (idx - 1 + SECTION_ENTRIES.length) % SECTION_ENTRIES.length
    } else if (e.key === 'Home') {
      next = 0
    } else if (e.key === 'End') {
      next = SECTION_ENTRIES.length - 1
    }
    if (next < 0) return
    e.preventDefault()
    const entry = SECTION_ENTRIES[next]
    selectSection(entry.id)
    navRefs.current[entry.id]?.focus()
  }

  return (
    <Dialog
      title="Preferences"
      width={760}
      maxWidth={760}
      bodyClass="settings-body"
      onClose={() => store.setSettingsOpen(false)}
      footer={
        <>
          <button className="btn" onClick={() => store.setSettingsOpen(false)}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() =>
              void store
                .saveSettings({
                  ai: {
                    baseUrl,
                    model,
                    customInstructions,
                    ...(apiKey.length > 0 ? { apiKey } : {})
                  },
                  accounts: {
                    // Same leave-unchanged rule as the AI key: empty boxes
                    // mean "keep what's stored".
                    ...(githubClientId.trim().length > 0
                      ? { githubClientId: githubClientId.trim() }
                      : {}),
                    ...(gitlabClientId.trim().length > 0
                      ? { gitlabClientId: gitlabClientId.trim() }
                      : {})
                  },
                  confirmOverrideWithGeneratedMessage: confirmOverride,
                  autoRefresh,
                  hintsEnabled,
                  autoUpdateChecks,
                  theme
                })
                .then(s => {
                  if (s !== null) store.setSettingsOpen(false)
                })
            }
          >
            Save
          </button>
        </>
      }
    >
      <div className="settings-shell">
        <div
          className="settings-nav"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Preference sections"
          onKeyDown={onNavKeyDown}
        >
          {SECTION_ENTRIES.map(entry => (
            <button
              key={entry.id}
              ref={el => {
                navRefs.current[entry.id] = el
              }}
              type="button"
              role="tab"
              id={`settings-tab-${entry.id}`}
              aria-selected={section === entry.id}
              aria-controls="settings-panel"
              tabIndex={section === entry.id ? 0 : -1}
              className={`settings-nav-item${section === entry.id ? ' active' : ''}`}
              onClick={() => selectSection(entry.id)}
            >
              <span className="nav-label">{entry.label}</span>
              <span className="nav-sub">{entry.sub}</span>
            </button>
          ))}
        </div>
        <div
          className="settings-pane"
          role="tabpanel"
          id="settings-panel"
          aria-labelledby={`settings-tab-${section}`}
          tabIndex={0}
        >
      {section === 'ai' && (
      <section className="settings-section">
        <h3>AI agent</h3>
        <p className="field-hint">
          Optional — this is what powers ✨ Generate in the commit tray and
          ✨ AI on conflicted files. The rest of Aspen works without any of
          it.
        </p>
        {state.settingsAiNote && (
          <div className="workflow-banner settings-note">
            <strong>The AI agent needs an endpoint first.</strong>
            <span>
              Point Base URL at any OpenAI-compatible server — OpenAI,
              OpenRouter, or a local Ollama or LM Studio — add an API key if
              your server asks for one, then press Test connection.
            </span>
          </div>
        )}
        <Field
          label="Base URL"
          hint="Any OpenAI-compatible server: https://api.openai.com/v1, https://openrouter.ai/api/v1, http://localhost:11434/v1 …"
          tip={'✨ Generate sends your staged diff and draft message to this one host — no other git content leaves the machine because of the AI.\nLocal servers (Ollama, LM Studio) answer the same shape and need no key.'}
        >
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
        </Field>
        <Field
          label="Model"
          hint="e.g. gpt-4o-mini, claude-3-5-haiku, llama3.1, qwen2.5-coder"
          tip={'Any model id your endpoint serves. Small, fast chat models write good commit messages — a 7–14B coder model locally beats a huge one over the wire.'}
        >
          <input value={model} onChange={e => setModel(e.target.value)} />
        </Field>
        <Field
          label="API key"
          hint={
            settings.ai.hasApiKey
              ? 'Stored securely. Type a new key to replace it.'
              : 'Stored encrypted on this machine (never sent to the UI).'
          }
          tip={'Encrypted with the Windows credential store and never re-displayed after saving. An empty box keeps the stored key; paste a new one to replace it.\nSent only to the Base URL host, as a plain Authorization header.'}
        >
          <input
            type="password"
            placeholder={settings.ai.hasApiKey ? '••••••••••••••' : 'sk-…'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
        </Field>
        <Field
          label="Custom commit message rules (optional)"
          hint="Fixed rules added to the AI's instructions for this app, e.g. conventional commits, issue trailer format."
          tip={'Plain text appended to the agent’s fixed system prompt for every generation in this app. Example: “summary ≤ 50 chars, body wrapped at 72, add Closes #NNN trailers”.'}
        >
          <textarea
            rows={3}
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
          />
        </Field>
        <div className="test-row">
          <button
            className="btn"
            disabled={testing}
            title="Sends one minimal chat request to the Base URL with the Model and key above, and reports how the endpoint answers."
            onClick={() => {
              setTesting(true)
              setTestResult(null)
              void store
                .testAiConnection({
                  baseUrl,
                  model,
                  ...(apiKey.length > 0 ? { apiKey } : {})
                })
                .then(r => {
                  setTestResult(`${r.ok ? '✓ ' : '✗ '}${r.message}`)
                })
                .finally(() => setTesting(false))
            }}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {testResult !== null && (
            <span className={testResult.startsWith('✓') ? 'ok' : 'bad'}>
              {testResult}
            </span>
          )}
        </div>
      </section>
      )}

      {section === 'accounts' && (
      <section className="settings-section">
        <h3>Accounts</h3>
        <AccountList />
        <SignInPanel />
        <details
          className="signin-apps"
          open={appsOpen}
          onToggle={e => setAppsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>
            Browser sign-in apps
            <InfoTip text={'Both browser buttons are always clickable. With an id here they go straight to your browser for authorization; without one the button first asks for the id, in place. Aspen ships no shared id, so your sign-ins never ride on someone else’s rate limits — and the token sign-in above needs none of this.'} />
          </summary>
          <p className="field-hint">
            The browser buttons sign you in through an OAuth application you register
            once and paste here (or bake into providers/config.ts and rebuild) — the
            sign-in panel walks you through the same registration when a box is empty.
            Aspen ships no shared id so your sign-ins never ride on someone else's
            rate limits.
          </p>
          <Field
            label="GitHub OAuth App client id"
            hint="github.com/settings/developers → new OAuth App → Authorization callback URL http://127.0.0.1:8765/callback and tick “Enable Device Flow” — one app serves the browser sign-in and the one-time-code fallback. Public by design; leave empty to fall back to the id baked in at build time."
            tip={'GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.\nHomepage URL: anything. Authorization callback URL: exactly http://127.0.0.1:8765/callback.\nTick “Enable Device Flow” — the one app covers both the browser sign-in and the code fallback.\nOnly the Client ID is used; Aspen never needs the secret.'}
          >
            <input
              placeholder={
                settings.accounts.hasGitHubClientId
                  ? '•••••••• configured — paste a new id to replace'
                  : 'Iv23li…'
              }
              value={githubClientId}
              onChange={e => setGitHubClientId(e.target.value)}
            />
          </Field>
          <Field
            label="GitLab application id"
            hint="gitlab.com Profile → Applications → confidential OFF, redirect URI exactly http://127.0.0.1:8765/callback, scope api."
            tip={'GitLab → Preferences → Applications.\nConfidential: OFF — Aspen is a public PKCE client.\nRedirect URI: exactly http://127.0.0.1:8765/callback; tick the api scope.\nPaste the numeric Application ID.'}
          >
            <input
              placeholder={
                settings.accounts.hasGitLabClientId
                  ? '•••••••• configured — paste a new id to replace'
                  : 'app id…'
              }
              value={gitlabClientId}
              onChange={e => setGitLabClientId(e.target.value)}
            />
          </Field>
        </details>
      </section>
      )}

      {section === 'behavior' && (
      <section className="settings-section">
        <h3>Behavior</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={confirmOverride}
            onChange={e => setConfirmOverride(e.target.checked)}
          />
          <span>Confirm before replacing a typed commit message with a generated one</span>
          <InfoTip text={'When off, ✨ Generate replaces a message you have typed without asking. When on, a typed summary or description makes Aspen confirm first.'} />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
          />
          <span>Refresh the changes list automatically when files change on disk</span>
          <InfoTip text={'When off, the changes list refreshes after git actions and when you press Refresh — handy if watching a very large working tree feels heavy.'} />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={hintsEnabled}
            onChange={e => setHintsEnabled(e.target.checked)}
          />
          <span>Show tips for getting started</span>
          <InfoTip text={'Hides the one-time coach banner, the first-run captions, and the pointer notes in these pages. Git facts, counts and errors stay visible regardless.'} />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={autoUpdateChecks}
            onChange={e => setAutoUpdateChecks(e.target.checked)}
          />
          <span>Check GitHub releases for updates at startup</span>
          <InfoTip text={'Aspen asks the public releases page of this app’s GitHub repository whether a newer version exists. Nothing identifies you, and nothing downloads or installs itself.'} />
        </label>
      </section>
      )}

      {section === 'appearance' && (
      <section className="settings-section">
        <h3>Appearance</h3>
        <Field
          label="Theme"
          hint="Applies the moment you press Save; Cancel leaves the current theme alone."
          tip={'System follows the OS light/dark setting.\nCommunity palettes re-ink every colour role at once — they change how the app looks, never how it behaves.'}
        >
          <select
            value={theme}
            onChange={e => {
              const next = e.target.value
              if (isThemeId(next)) setTheme(next)
            }}
          >
            {autoEntries.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
            <optgroup label="Light">
              {lightEntries.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Dark">
              {darkEntries.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
      </section>
      )}
        </div>
      </div>
    </Dialog>
  )
}

/** Per-account clone-pane cache entry; survives tab switches, not close. */
interface PaneEntry {
  readonly state: RepoPaneState
  readonly search: string
  readonly sort: RemoteRepoSort
}

const DEFAULT_SORT: RemoteRepoSort = 'pushed'

export function CloneDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [url, setUrl] = useState('')
  const [folderName, setFolderName] = useState('')
  const [suggested, setSuggested] = useState('')
  const [baseDir, setBaseDir] = useState('')
  const [folderTouched, setFolderTouched] = useState(false)
  const [tab, setTab] = useState<string>('url')
  const [panes, setPanes] = useState<Record<string, PaneEntry>>({})
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const accounts = state.accounts
  const activeAccount = accounts.find(a => a.id === tab) ?? null

  useEffect(() => {
    if (!state.showClone) {
      setUrl('')
      setFolderName('')
      setSuggested('')
      setBaseDir('')
      setFolderTouched(false)
      setTab('url')
      setPanes({})
      return
    }
    // The tab list must reflect accounts added since the app booted — and
    // sign-ins completed from inside this very dialog.
    void store.refreshAccounts()
  }, [state.showClone, store])

  useEffect(() => {
    if (!state.showClone) return
    // Ask main for the folder name so the clone dialog and `git clone`
    // agree on one rule (picking a hosted row routes through the same path).
    const timer = setTimeout(() => {
      if (url.trim().length === 0) return
      void call('suggestCloneFolder', url)
        .then(name => setSuggested(name))
        .catch(() => setSuggested(''))
    }, 200)
    return () => clearTimeout(timer)
  }, [state.showClone, url])

  // A signed-out or vanished tab never stays selected; empty account lists
  // own the Accounts (sign-in) tab, signed-in users land on their first.
  useEffect(() => {
    if (!state.showClone) return
    if (tab === 'url') return
    if (activeAccount === null && (tab === 'signin' || accounts.length === 0)) return
    if (activeAccount === null) setTab(accounts[0]?.id ?? 'signin')
  }, [state.showClone, tab, activeAccount, accounts])

  if (!state.showClone) return null

  const pane = activeAccount === null ? null : panes[activeAccount.id] ?? null

  const loadPane = async (
    account: AccountInfo,
    search: string,
    sort: RemoteRepoSort,
    more: boolean
  ): Promise<void> => {
    const cursor = more ? panes[account.id]?.state.nextCursor ?? null : null
    setPanes(prev => ({
      ...prev,
      [account.id]: {
        search,
        sort,
        state: {
          ...(prev[account.id]?.state ?? EMPTY_PANE),
          loading: true,
          error: null
        }
      }
    }))
    try {
      const page = await store.listRemoteRepos(account.id, search, cursor, sort)
      setPanes(prev => ({
        ...prev,
        [account.id]: {
          search,
          sort,
          state: {
            // 'more' appends to whatever was loaded for the same search.
            items: more ? [...(prev[account.id]?.state.items ?? []), ...page.items] : page.items,
            nextCursor: page.nextCursor,
            loading: false,
            error: null
          }
        }
      }))
    } catch (err) {
      setPanes(prev => ({
        ...prev,
        [account.id]: {
          search,
          sort,
          state: {
            ...(prev[account.id]?.state ?? EMPTY_PANE),
            loading: false,
            error: err instanceof Error ? err.message : String(err)
          }
        }
      }))
    }
  }

  // First view of an account tab fetches its first page automatically.
  useEffect(() => {
    if (activeAccount !== null && panes[activeAccount.id] === undefined) {
      void loadPane(activeAccount, '', DEFAULT_SORT, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.showClone, activeAccount?.id])

  const onSearch = (value: string): void => {
    if (activeAccount === null) return
    const account = activeAccount
    const sort = panes[account.id]?.sort ?? DEFAULT_SORT
    setPanes(prev => ({
      ...prev,
      [account.id]: {
        search: value,
        sort,
        state: prev[account.id]?.state ?? EMPTY_PANE
      }
    }))
    // Both providers search server-side now (GitHub Search API / GitLab
    // ?search=); the pane re-filters loaded items for instant feedback.
    // Debounced so typing does not chase the API (GitHub's search has its
    // own, tighter rate limit).
    if (searchDebounce.current !== null) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => void loadPane(account, value, sort, false), 400)
  }

  const onSort = (value: RemoteRepoSort): void => {
    if (activeAccount === null) return
    const account = activeAccount
    const search = panes[account.id]?.search ?? ''
    void loadPane(account, search, value, false)
  }

  const derivedName = folderTouched ? folderName : suggested

  return (
    <Dialog
      title="Clone a repository"
      width={620}
      maxWidth={620}
      onClose={() => store.setCloneOpen(false)}
      footer={
        <>
          <button className="btn" onClick={() => store.setCloneOpen(false)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={
              url.trim().length === 0 ||
              baseDir.length === 0 ||
              derivedName.trim().length === 0
            }
            onClick={() =>
              void store.clone(url, baseDir, derivedName.trim())
            }
          >
            Clone
          </button>
        </>
      }
    >
      <div className="clone-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'url'}
          className={`clone-tab${tab === 'url' ? ' active' : ''}`}
          onClick={() => setTab('url')}
        >
          URL
        </button>
        {accounts.map(a => (
          <button
            key={a.id}
            role="tab"
            aria-selected={tab === a.id}
            className={`clone-tab${tab === a.id ? ' active' : ''}`}
            onClick={() => setTab(a.id)}
            title={`Repositories for ${a.login}`}
          >
            {a.provider === 'github' ? 'GitHub' : 'GitLab'} · {a.login}
          </button>
        ))}
        {accounts.length === 0 && (
          <button
            role="tab"
            aria-selected={tab === 'signin'}
            className={`clone-tab${tab === 'signin' ? ' active' : ''}`}
            onClick={() => setTab('signin')}
          >
            Accounts
          </button>
        )}
      </div>

      {tab === 'url' && (
        <Field
          label="Repository URL"
          hint="https://github.com/owner/repo.git or git@github.com:owner/repo.git — authentication uses your git credential helper, falling back to your signed-in account's token."
        >
          <input
            autoFocus
            placeholder="https://github.com/owner/repo.git"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
        </Field>
      )}
      {activeAccount !== null && (
        <RemoteRepoPane
          account={activeAccount}
          pane={pane?.state ?? EMPTY_PANE}
          search={pane?.search ?? ''}
          onSearch={onSearch}
          sort={pane?.sort ?? DEFAULT_SORT}
          onSort={onSort}
          onRefresh={() =>
            void loadPane(
              activeAccount,
              pane?.search ?? '',
              pane?.sort ?? DEFAULT_SORT,
              false
            )
          }
          onLoadMore={() =>
            void loadPane(
              activeAccount,
              pane?.search ?? '',
              pane?.sort ?? DEFAULT_SORT,
              true
            )
          }
          onPick={repo => {
            // Choosing a row fills the URL through the same suggestion
            // pipeline as typing one — the footer Clone then works unchanged.
            setUrl(repo.cloneUrl)
            setFolderTouched(false)
          }}
          pickedCloneUrl={url.trim()}
        />
      )}
      {tab === 'signin' && activeAccount === null && (
        <SignInPanel onSuccess={account => setTab(account.id)} />
      )}

      <Field label="Name">
        <input
          placeholder={suggested || 'repository'}
          value={derivedName}
          onChange={e => {
            setFolderTouched(true)
            setFolderName(e.target.value)
          }}
        />
      </Field>
      <Field label="Local path">
        <div className="row">
          <input
            readOnly
            placeholder="Choose a folder…"
            value={baseDir}
            onClick={async () => {
              const dir = await call('selectDirectory')
              if (dir !== null) setBaseDir(dir)
            }}
          />
          <button
            className="btn"
            onClick={async () => {
              const dir = await call('selectDirectory')
              if (dir !== null) setBaseDir(dir)
            }}
          >
            Choose…
          </button>
        </div>
      </Field>
      {state.busy === 'clone' && <p className="busy-line">Cloning…</p>}
    </Dialog>
  )
}

/**
 * Create / Publish — one dialog, two modes, mirroring how the Clone dialog
 * already grows a tab per signed-in account. 'new' builds a repository on
 * disk and can take it online in the same breath; 'publish' does the online
 * half for the selected repository that has no origin. The account tabs are
 * the answer to "which one do I publish to" when several accounts are
 * signed in, and each tab's owner dropdown adds that account's
 * organizations / groups. Without write scope the provider's own 403 (made
 * actionable by providerErrorMessage) shows here, not in a toast the user
 * has already lost.
 */
export function NewRepositoryDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const mode = state.repoDialog
  const publishing = mode === 'publish'

  const [tab, setTab] = useState<string>('signin')
  const [owners, setOwners] = useState<Readonly<Record<string, ReadonlyArray<ProviderOwner>>>>({})
  const [owner, setOwner] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [addReadme, setAddReadme] = useState(true)
  const [baseDir, setBaseDir] = useState('')
  const [error, setError] = useState<string | null>(null)

  const accounts = state.accounts
  const activeAccount = accounts.find(a => a.id === tab) ?? null
  const busy = state.busy === 'create' || state.busy === 'publish'
  const ownerList = activeAccount === null ? null : owners[activeAccount.id] ?? null

  // Fresh fields on every open. The destination defaults to the folder used
  // last, then the watch folder — a newcomer who set one never picks again.
  useEffect(() => {
    if (mode === null) return
    setName(publishing ? state.selectedRepo?.name ?? '' : '')
    setDescription('')
    setIsPrivate(false)
    setAddReadme(true)
    setError(null)
    setOwners({})
    setOwner('')
    setTab(accounts[0]?.id ?? 'signin')
    setBaseDir(
      window.localStorage.getItem('aspen.lastNewRepoDir') ??
        state.settings?.scanFolder ??
        ''
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // A signed-out or vanished tab never stays selected; empty account lists
  // own the Accounts (sign-in) tab, exactly like the Clone dialog.
  useEffect(() => {
    if (mode === null) return
    if (tab === 'signin') return
    if (activeAccount === null) setTab(accounts[0]?.id ?? 'signin')
  }, [mode, tab, activeAccount, accounts])

  const loadOwners = (account: AccountInfo): void => {
    void store
      .loadOwners(account.id)
      .then(list => {
        setOwners(prev => ({ ...prev, [account.id]: list }))
        setOwner(prev => (list.some(o => o.name === prev) ? prev : list[0]?.name ?? account.login))
      })
      .catch(err =>
        setError(err instanceof Error ? err.message : String(err))
      )
  }

  // First view of an account tab fetches its owners automatically.
  useEffect(() => {
    if (activeAccount !== null && owners[activeAccount.id] === undefined) {
      loadOwners(activeAccount)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeAccount?.id])

  if (mode === null) return null

  const canPublish =
    activeAccount !== null && owner.length > 0 && name.trim().length > 0
  const canCreateLocal = name.trim().length > 0 && baseDir.length > 0

  const publishTarget = {
    accountId: activeAccount?.id ?? '',
    owner,
    name,
    description,
    isPrivate
  }
  const rememberDir = (): void => {
    try {
      window.localStorage.setItem('aspen.lastNewRepoDir', baseDir)
    } catch {
      /* private-mode localStorage — the default just stays the scan folder */
    }
  }

  return (
    <Dialog
      title={publishing ? 'Publish repository' : 'Create a repository'}
      width={560}
      onClose={() => store.setRepoDialog(null)}
      footer={
        <>
          <button className="btn" onClick={() => store.setRepoDialog(null)}>
            Cancel
          </button>
          {!publishing && (
            <button
              className="btn"
              disabled={!canCreateLocal || busy}
              onClick={() => {
                rememberDir()
                void store.createRepository({
                  parentDir: baseDir,
                  name,
                  description,
                  isPrivate,
                  addReadme,
                  publish: false,
                  accountId: null,
                  owner: ''
                })
              }}
            >
              Create on this machine only
            </button>
          )}
          <button
            className="btn primary"
            disabled={!canPublish || busy}
            onClick={() => {
              rememberDir()
              if (publishing) {
                void store.publishRepository(publishTarget)
              } else {
                void store.createRepository({
                  parentDir: baseDir,
                  ...publishTarget,
                  addReadme,
                  publish: true
                })
              }
            }}
          >
            {busy
              ? publishing
                ? 'Publishing…'
                : 'Creating…'
              : publishing
                ? 'Publish repository'
                : 'Create and Publish'}
          </button>
        </>
      }
    >
      {publishing && state.selectedRepo !== null && (
        <p className="field-hint">
          Publishes <strong>{state.selectedRepo.name}</strong> (
          {state.selectedRepo.path}) to the account you pick, then pushes the
          current branch.
        </p>
      )}

      <div className="clone-tabs" role="tablist">
        {accounts.map(a => (
          <button
            key={a.id}
            role="tab"
            aria-selected={tab === a.id}
            className={`clone-tab${tab === a.id ? ' active' : ''}`}
            onClick={() => setTab(a.id)}
            title={`Publish as ${a.login}`}
          >
            {a.provider === 'github' ? 'GitHub' : 'GitLab'} · {a.login}
          </button>
        ))}
        {accounts.length === 0 && (
          <button
            role="tab"
            aria-selected={tab === 'signin'}
            className={`clone-tab${tab === 'signin' ? ' active' : ''}`}
            onClick={() => setTab('signin')}
          >
            Accounts
          </button>
        )}
      </div>

      {tab === 'signin' && activeAccount === null && (
        <SignInPanel onSuccess={account => setTab(account.id)} />
      )}

      {activeAccount !== null && (
        <Field
          label="Owner"
          hint="Where the repository lives — your account, or an organization/group you can create in."
        >
          <div className="row">
            <select
              value={owner}
              onChange={e => setOwner(e.target.value)}
              disabled={ownerList === null}
            >
              {ownerList === null ? (
                <option value="">Loading owners…</option>
              ) : (
                ownerList.map(o => (
                  <option key={o.name} value={o.name}>
                    {o.displayName}
                    {o.kind === 'user' ? ' (you)' : ''}
                  </option>
                ))
              )}
            </select>
            <button
              className="btn"
              onClick={() => loadOwners(activeAccount)}
              title="Reload the owners this token can publish into"
            >
              ↻
            </button>
          </div>
        </Field>
      )}

      <Field
        label="Name"
        hint="Letters, numbers, dots, dashes and underscores — this becomes the repository and folder name."
      >
        <input
          autoFocus
          placeholder="my-project"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </Field>
      <Field label="Description (optional)">
        <input
          placeholder="What this repository is for"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </Field>
      <label className="check-row">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={e => setIsPrivate(e.target.checked)}
        />
        <span>Private repository — visible only to you and people you invite</span>
      </label>
      {!publishing && (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              checked={addReadme}
              onChange={e => setAddReadme(e.target.checked)}
            />
            <span>Initialize with a README, staged for your first commit</span>
          </label>
          <Field label="Local path">
            <div className="row">
              <input
                readOnly
                placeholder="Choose a folder…"
                value={baseDir}
                onClick={async () => {
                  const dir = await call('selectDirectory')
                  if (dir !== null) setBaseDir(dir)
                }}
              />
              <button
                className="btn"
                onClick={async () => {
                  const dir = await call('selectDirectory')
                  if (dir !== null) setBaseDir(dir)
                }}
              >
                Choose…
              </button>
            </div>
          </Field>
        </>
      )}
      {error !== null && <p className="field-hint merge-error">{error}</p>}
      {activeAccount === null && (
        <p className="field-hint">
          {publishing
            ? 'Sign in above to publish this repository.'
            : 'Sign in above to publish right away — or create it locally and publish later.'}
        </p>
      )}
    </Dialog>
  )
}

/**
 * Creates a branch from a chosen base: any local branch, a remote-tracking
 * branch (which gets local tracking, like a checkout from the branch list),
 * or — when opened from History — the selected commit. The base defaults to
 * the checked-out branch / selected commit but is freely switchable.
 */
export function NewBranchDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [name, setName] = useState('')
  const [filter, setFilter] = useState('')
  const commitBase = state.newBranchBase
  const defaultBase = commitBase ?? state.status?.branch ?? 'HEAD'
  const [base, setBase] = useState(defaultBase)

  useEffect(() => {
    if (!state.showNewBranch) {
      setName('')
      setFilter('')
      setBase(defaultBase)
    }
    // defaultBase only matters when the dialog closes; re-running is harmless.
  }, [state.showNewBranch, defaultBase])

  if (!state.showNewBranch) return null

  const needle = filter.toLowerCase().trim()
  const create = (): void => {
    if (name.trim().length === 0) return
    void store.createBranch(name, base === defaultBase ? undefined : base)
  }
  const isBase = (ref: string): boolean => ref === base
  const optionTitle =
    base === commitBase && commitBase !== null
      ? `Starting at commit ${commitBase}, and switching to it.`
      : `Starting at "${base}", and switching to it.`

  return (
    <Dialog
      title="New branch"
      onClose={() => store.setNewBranchOpen(false)}
      width={480}
      footer={
        <>
          <button className="btn" onClick={() => store.setNewBranchOpen(false)}>
            Cancel
          </button>
          <button className="btn primary" disabled={name.trim().length === 0} onClick={create}>
            Create branch
          </button>
        </>
      }
    >
      <Field label="Branch name" hint={optionTitle}>
        <input
          autoFocus
          placeholder="my-new-branch"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') create()
          }}
        />
      </Field>
      <Field label="Create from">
        <input
          className="popover-filter"
          placeholder="Filter branches"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <div className="dialog-branch-list">
          {commitBase !== null && 'commit'.includes(needle) && (
            <button
              key="nb-commit"
              className={`popover-item${isBase(commitBase) ? ' active' : ''}`}
              title={`Start the new branch at commit ${commitBase}`}
              onClick={() => setBase(commitBase)}
            >
              <span className="branch-line">Commit {commitBase}</span>
            </button>
          )}
          {state.branches
            .filter(b => b.name.toLowerCase().includes(needle))
            .map(b => (
              <button
                key={`nb-local-${b.name}`}
                className={`popover-item${isBase(b.name) ? ' active' : ''}`}
                title={`Start the new branch at "${b.name}"`}
                onClick={() => setBase(b.name)}
              >
                <span className="branch-line">{b.name}</span>
                {b.current ? (
                  <small className="popover-path">current branch</small>
                ) : null}
              </button>
            ))}
          {state.remoteBranches
            .filter(
              b =>
                !b.name.endsWith('/HEAD') &&
                `${b.remote}/${b.name}`.toLowerCase().includes(needle)
            )
            .map(b => (
              <button
                key={`nb-remote-${b.remote}-${b.name}`}
                className={`popover-item${isBase(`${b.remote}/${b.name}`) ? ' active' : ''}`}
                title={`Start the new branch at ${b.remote}/${b.name} (sets up tracking)`}
                onClick={() => setBase(`${b.remote}/${b.name}`)}
              >
                <span className="branch-line">{b.name}</span>
                <small className="popover-path">
                  {b.remote}/{b.name}
                </small>
              </button>
            ))}
          {base === 'HEAD' && 'HEAD'.includes(needle) && (
            <button
              key="nb-head"
              className={`popover-item${isBase('HEAD') ? ' active' : ''}`}
              title="Start the new branch at the current HEAD (detached)"
              onClick={() => setBase('HEAD')}
            >
              <span className="branch-line">HEAD</span>
            </button>
          )}
        </div>
      </Field>
    </Dialog>
  )
}

/**
 * Picks a branch to merge into the checked-out one. The dialog itself is
 * the confirmation (unlike the branch popover's row shortcuts, which route
 * through store.requestMergeBranch); opening it from Repository ▸ Merge… or
 * the branch dropdown's footer item.
 */
export function MergeBranchDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<{
    name: string
    remote?: string
  } | null>(null)

  useEffect(() => {
    if (!state.mergeBranchOpen) {
      setFilter('')
      setSelected(null)
    }
  }, [state.mergeBranchOpen])

  if (!state.mergeBranchOpen) return null

  const current = state.status?.branch ?? '(detached)'
  const needle = filter.toLowerCase().trim()
  const locals = state.branches.filter(
    b => !b.current && b.name.toLowerCase().includes(needle)
  )
  const remotes = state.remoteBranches.filter(b =>
    b.name.toLowerCase().includes(needle)
  )
  const nothingFound = locals.length === 0 && remotes.length === 0

  const isSelected = (name: string, remote?: string): boolean =>
    selected !== null &&
    selected.name === name &&
    (remote ?? undefined) === (selected.remote ?? undefined)

  const merge = (): void => {
    if (selected === null) return
    void store.mergeBranch(selected.name, selected.remote)
  }

  return (
    <Dialog
      title={`Merge a branch into "${current}"`}
      onClose={() => store.setMergeBranchOpen(false)}
      width={520}
      footer={
        <>
          <button className="btn" onClick={() => store.setMergeBranchOpen(false)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={selected === null || state.busy !== null}
            onClick={merge}
          >
            {state.busy === 'merge' ? <span className="spinner" /> : null} Merge
          </button>
        </>
      }
    >
      <input
        className="popover-filter"
        autoFocus
        placeholder="Filter branches"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') merge()
          if (e.key === 'Escape') store.setMergeBranchOpen(false)
        }}
      />
      <div className="dialog-branch-list">
        {nothingFound && (
          <div className="popover-empty">
            {state.branches.length + state.remoteBranches.length <= 1
              ? 'No other branches to merge'
              : 'No matching branches'}
          </div>
        )}
        {locals.map(b => (
          <button
            key={`merge-local-${b.name}`}
            className={`popover-item${isSelected(b.name) ? ' active' : ''}`}
            title={`Merge "${b.name}" into "${current}"${divergenceTitleSuffix(b)}`}
            onClick={() => setSelected({ name: b.name })}
          >
            <span className="branch-line">
              {b.name}
              <BranchDivergence branch={b} current={current} />
            </span>
          </button>
        ))}
        {remotes.length > 0 && (
          <>
            <div className="popover-sep" />
            <div className="popover-heading">Remote branches</div>
            {remotes.map(b => (
              <button
                key={`merge-remote-${b.remote}-${b.name}`}
                className={`popover-item${
                  isSelected(b.name, b.remote) ? ' active' : ''
                }`}
                title={`Merge the remote-tracking branch ${b.remote}/${b.name} into "${current}"${divergenceTitleSuffix(b)}`}
                onClick={() =>
                  setSelected({ name: b.name, remote: b.remote })
                }
              >
                <span className="branch-line">
                  {b.name}
                  <BranchDivergence branch={b} current={current} />
                </span>
                <small className="popover-path">
                  {b.remote}/{b.name}
                </small>
              </button>
            ))}
          </>
        )}
      </div>
      <span className="field-hint">
        The chosen branch is merged into{' '}
        <strong>{current}</strong> — fast-forward when possible, a merge
        commit otherwise.
      </span>
    </Dialog>
  )
}

export function RenameBranchDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [name, setName] = useState('')
  const oldName = state.renameBranchTarget

  useEffect(() => {
    if (state.renameBranchTarget === null) setName('')
  }, [state.renameBranchTarget])

  if (oldName === null) return null

  const valid = name.trim().length > 0 && name.trim() !== oldName

  return (
    <Dialog
      title={`Rename branch "${oldName}"`}
      onClose={() => store.setRenameBranchTarget(null)}
      footer={
        <>
          <button className="btn" onClick={() => store.setRenameBranchTarget(null)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!valid}
            onClick={() => void store.renameBranch(oldName, name)}
          >
            Rename
          </button>
        </>
      }
    >
      <Field label="New branch name" hint="Only the local branch is renamed.">
        <input
          autoFocus
          defaultValue={oldName}
          placeholder={oldName}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && valid) void store.renameBranch(oldName, name)
          }}
        />
      </Field>
    </Dialog>
  )
}

/**
 * "Stash your changes": park every working change — untracked included —
 * under an optional message. ✨ describes all dirty paths with the same
 * agent (and cancel channel) as the commit box; leaving the fields empty
 * stashes under git's plain "Aspen on <branch>" label.
 */
export function StashDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!state.showStash) {
      setTitle('')
      setDescription('')
    }
  }, [state.showStash])

  if (!state.showStash) return null

  const count = state.status?.files.length ?? 0
  const busy = state.busy !== null
  const stash = (): void => {
    void store.stashWithMessage(title, description)
  }

  return (
    <Dialog
      title="Stash your changes"
      onClose={() => store.setStashOpen(false)}
      width={480}
      footer={
        <>
          <button className="btn" onClick={() => store.setStashOpen(false)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || count === 0}
            onClick={stash}
          >
            {state.busy === 'stash' ? <span className="spinner" /> : null} Stash all
          </button>
        </>
      }
    >
      <p className="confirm-message">
        All {count} changed file{count === 1 ? '' : 's'} will be moved to the
        stash and your working directory will be clean. Restore them later from
        the stash panel.
      </p>
      <Field
        label="Message"
        hint="Optional. Names the stash in the list so you can find it again."
      >
        <input
          autoFocus
          placeholder="work-in-progress on the parser"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') stash()
          }}
        />
      </Field>
      <Field
        label="Description"
        tip="Stored as the stash commit's message body — visible in the stash detail pane and in git log."
      >
        <textarea
          rows={3}
          placeholder="What these changes are about"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </Field>
      <div className="commit-actions">
        {state.aiBusy ? (
          <button
            className="btn ai"
            onClick={() => store.cancelGeneration()}
            title="Cancel generation"
          >
            <span className="spinner" /> Cancel
          </button>
        ) : (
          <button
            className="btn ai"
            disabled={busy || count === 0}
            onClick={() =>
              void store.generateStashDraft().then(draft => {
                if (draft !== null) {
                  setTitle(draft.title)
                  setDescription(draft.description)
                }
              })
            }
            title="Describe all working changes with the AI agent"
          >
            ✨ Describe
          </button>
        )}
      </div>
    </Dialog>
  )
}

/** One honest sentence about where the self-update flow stands. Errors and
 *  up-to-date verdicts surface the last answer main gave; downloads report
 *  live progress. Never claims an update Aspen hasn't seen. */
function updateSummary(update: UpdateState | null, currentVersion: string | null): string {
  if (update === null) {
    return 'Aspen checks GitHub releases a few seconds after launch; you can check any time from here.'
  }
  switch (update.phase) {
    case 'checking':
      return 'Checking GitHub releases…'
    case 'available':
      return update.canInstall
        ? `Aspen ${update.version ?? 'x'} is available — choose an action below.`
        : `Aspen ${update.version ?? 'x'} is available — this build updates from the releases page.`
    case 'downloading':
      return `Downloading Aspen ${update.version ?? 'x'} — ${update.percent ?? 0}%.`
    case 'ready':
      return `Aspen ${update.version ?? 'x'} is ready — restart to install it.`
    case 'up-to-date':
      return `Aspen ${currentVersion ?? ''} is the newest release.`
    case 'error':
      return update.error ?? 'The update check failed.'
  }
}

export function AboutDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [appVersion, setAppVersion] = useState<string | null>(null)

  // The packaged version, asked from main once per dialog open — the About
  // card must report what is actually running, not what package.json said
  // at the last release cut.
  useEffect(() => {
    if (!state.showAbout) return
    let alive = true
    void call('getAppVersion')
      .then(v => {
        if (alive) setAppVersion(v)
      })
      .catch(() => {
        /* the line just keeps showing the ellipsis */
      })
    return () => {
      alive = false
    }
  }, [state.showAbout])

  if (!state.showAbout) return null

  const update = state.update

  return (
    <Dialog
      title="About Aspen"
      width={420}
      onClose={() => store.setAboutOpen(false)}
      footer={
        <button className="btn primary" onClick={() => store.setAboutOpen(false)}>
          Close
        </button>
      }
    >
      <p className="confirm-message">
        <strong>Aspen Git</strong> — a visual desktop client for Git, with an
        AI commit-message and merge agent.
      </p>
      <p className="confirm-message">
        Version {appVersion ?? '…'} · git operations run through your system{' '}
        <code>git</code>; AI requests go to the OpenAI-compatible endpoint
        configured in Preferences.
      </p>
      <div className="settings-section">
        <h3>Keyboard shortcuts</h3>
        <ul className="shortcut-list">
          <li>
            <code>Ctrl+Enter</code> commit selected files
          </li>
          <li>
            <code>Ctrl+Shift+X</code> / <code>Ctrl+Shift+Z</code> stage / unstage all
          </li>
          <li>
            <code>Ctrl+Shift+S</code> stash all changes
          </li>
          <li>
            <code>Ctrl+Shift+M</code> edit the latest commit
          </li>
          <li>
            <code>Ctrl+Shift+F</code> / <code>P</code> / <code>U</code> fetch / pull / push
          </li>
          <li>
            <code>Ctrl+Shift+G</code> view on GitHub · <code>Ctrl+R</code> refresh
          </li>
          <li>
            <code>Ctrl+,</code> preferences
          </li>
        </ul>
      </div>
      <div className="settings-section">
        <h3>Updates</h3>
        <p className="confirm-message">{updateSummary(update, appVersion)}</p>
        {update?.phase === 'downloading' && (
          <div
            className="update-progress"
            role="progressbar"
            aria-label="Update download progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={update.percent ?? 0}
          >
            <div
              className="update-progress-fill"
              style={{ width: `${update.percent ?? 0}%` }}
            />
          </div>
        )}
        <div className="donate-row">
          {update?.phase === 'ready' ? (
            <button
              className="btn primary"
              onClick={() => void store.checkForUpdatesNow()}
            >
              Restart to update
            </button>
          ) : update?.phase === 'available' && update.canInstall ? (
            <button
              className="btn primary"
              onClick={() => void store.downloadAvailableUpdate()}
            >
              Download update
            </button>
          ) : (
            <button
              className="btn"
              disabled={update?.phase === 'checking' || update?.phase === 'downloading'}
              onClick={() => void store.checkForUpdatesNow()}
            >
              Check for updates
            </button>
          )}
          {(update === null ||
            update.phase === 'available' ||
            update.phase === 'error') && (
            <button
              className="btn"
              onClick={() =>
                void call('openExternal', update?.releaseUrl ?? RELEASES_URL)
              }
            >
              View releases
            </button>
          )}
        </div>
      </div>
      <div className="settings-section">
        <h3>Support the development</h3>
        <p className="confirm-message">
          Aspen is free and open source. If it saves you time, consider a
          small donation to support Kurtis Hight and continued work on the
          project.
        </p>
        <div className="donate-row">
          <button
            className="btn primary"
            onClick={() => void call('openExternal', DONATE_URL)}
          >
            ♥ Donate via PayPal
          </button>
          <small className="muted">paypal.com/paypalme/kurtishight</small>
        </div>
      </div>
    </Dialog>
  )
}

export function ConfirmDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()

  if (state.confirm === null) return null
  const { title, message, confirmLabel, altLabel, onAlt, onConfirm } = state.confirm

  return (
    <Dialog
      title={title}
      onClose={() => store.dismissConfirm()}
      footer={
        <>
          <button className="btn" onClick={() => store.dismissConfirm()}>
            Cancel
          </button>
          {altLabel !== undefined && onAlt !== undefined && (
            <button className="btn" onClick={onAlt}>
              {altLabel}
            </button>
          )}
          <button
            className={`btn primary${state.confirm.tone === 'danger' ? ' destructive' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Dialog>
  )
}

/**
 * The AI merge agent's side of one conflicted file: it thinks, possibly
 * asks, and the answers given here decide the merge. Closing aborts an
 * in-flight turn; a failed turn keeps the typed exchanges and offers a retry.
 */
export function AiMergeDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const merge = state.aiMerge
  const [answers, setAnswers] = useState<Record<string, string>>({})

  // A new question round starts the answer boxes fresh.
  useEffect(() => {
    if (merge !== null && !merge.busy && merge.error === null) setAnswers({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merge?.questions])

  if (merge === null) return null

  const questions = merge.questions
  const allAnswered =
    questions !== null &&
    questions.length > 0 &&
    questions.every(q => (answers[q.id] ?? '').trim().length > 0)

  const submit = (): void => {
    if (questions === null || !allAnswered) return
    store.submitAiMerge(
      questions.map(q => ({
        questionId: q.id,
        answer: (answers[q.id] ?? '').trim()
      }))
    )
  }

  return (
    <Dialog
      title="✨ AI merge agent"
      width={540}
      onClose={() => store.closeAiMerge()}
      footer={
        <>
          <button className="btn" onClick={() => store.closeAiMerge()}>
            {merge.busy ? 'Cancel' : 'Close'}
          </button>
          {merge.error !== null && !merge.busy && (
            <button className="btn" onClick={() => store.retryAiMerge()}>
              Try again
            </button>
          )}
          {questions !== null && (
            <button
              className="btn primary"
              disabled={!allAnswered || merge.busy}
              onClick={submit}
            >
              {merge.busy ? <span className="spinner" /> : null} Send answers
            </button>
          )}
        </>
      }
    >
      <p className="confirm-message">
        Merging <code>{merge.path}</code>
        {questions === null && merge.busy && (
          <span className="merge-thinking">
            {' '}
            <span className="spinner" /> thinking…
          </span>
        )}
      </p>

      {questions !== null && (
        <div className="merge-questions">
          {questions.map((q, i) => (
            <div className="field" key={q.id}>
              <span className="field-label">
                {questions.length > 1 ? `${i + 1}. ` : ''}
                {q.prompt}
              </span>
              {q.options !== undefined && q.options.length > 0 && (
                <div className="merge-options">
                  {q.options.map(opt => (
                    <button
                      type="button"
                      key={opt}
                      className={`mini merge-option${
                        (answers[q.id] ?? '') === opt ? ' active' : ''
                      }`}
                      disabled={merge.busy}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                rows={2}
                placeholder="Your answer"
                aria-label={`Answer to: ${q.prompt}`}
                disabled={merge.busy}
                value={answers[q.id] ?? ''}
                onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
                }}
              />
            </div>
          ))}
          {merge.busy && (
            <p className="merge-thinking">
              <span className="spinner" /> thinking…
            </p>
          )}
        </div>
      )}

      {merge.error !== null && (
        <p className="field-hint merge-error">{merge.error}</p>
      )}
    </Dialog>
  )
}
