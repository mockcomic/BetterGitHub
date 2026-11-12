import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { call } from '../api'
import { useStore, useStoreState } from '../store'
import type { AccountInfo, ProviderOwner, RemoteRepoSort } from '../../../shared/models'
import type { ThemeId } from '../../../shared/themes'
import { isThemeId, THEME_ENTRIES } from '../../../shared/themes'
import { Dialog, Field, InfoTip } from './Dialog'
import { BranchDivergence } from './BranchBadges'
import { branchAriaLabel, divergenceTitleSuffix } from '../divergence'
import { AccountList, EMPTY_PANE, RemoteRepoPane, SignInPanel, type RepoPaneState } from './AccountsUi'

import { DONATE_URL } from '../../../shared/links'
import { RELEASES_URL, type UpdateState } from '../../../shared/updates'
import {
  AUTO_FETCH_CHOICES,
  DEFAULT_AUTO_FETCH_MINUTES,
  isAutoFetchMinutes
} from '../../../shared/auto-fetch'
import type { AutoFetchMinutes } from '../../../shared/auto-fetch'

const autoEntries = THEME_ENTRIES.filter(e => e.group === 'auto')
const lightEntries = THEME_ENTRIES.filter(e => e.group === 'light')
const darkEntries = THEME_ENTRIES.filter(e => e.group === 'dark')

/** How each offered fetch cadence is named in Preferences ▸ Behavior. */
const AUTO_FETCH_LABELS: Record<AutoFetchMinutes, string> = {
  0: 'Off — fetch only when I press Fetch',
  1: 'Every minute',
  5: 'Every 5 minutes',
  15: 'Every 15 minutes',
  30: 'Every 30 minutes',
  60: 'Every hour'
}

/** The preferences rail, in panel order. General leads: it is where the
 *  app-level switches live, and the conventional first item of a settings
 *  window — and the selected item has to be the first one, or the rail reads
 *  as broken. Accounts, the first thing a fresh install needs, is a click or
 *  an arrow key away; the AI pointer note still overrides on open. */
type SettingsSection =
  | 'general'
  | 'accounts'
  | 'ai'
  | 'appearance'
  | 'behavior'

const SECTION_ENTRIES: ReadonlyArray<{
  readonly id: SettingsSection
  readonly label: string
  readonly sub: string
}> = [
  { id: 'general', label: 'General', sub: 'Updates, tips, watch folder' },
  { id: 'accounts', label: 'Accounts', sub: 'Providers, tokens, OAuth apps' },
  { id: 'ai', label: 'AI agent', sub: 'The endpoint behind ✨ Generate' },
  { id: 'appearance', label: 'Appearance', sub: 'Theme and palettes' },
  { id: 'behavior', label: 'Behavior', sub: 'Commit prompts, auto-refresh' }
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
  const [autoFetchMinutes, setAutoFetchMinutes] =
    useState<AutoFetchMinutes>(DEFAULT_AUTO_FETCH_MINUTES)
  const [hintsEnabled, setHintsEnabled] = useState(true)
  const [autoUpdateChecks, setAutoUpdateChecks] = useState(true)
  const [theme, setTheme] = useState<ThemeId>('system')
  const [scanFolder, setScanFolder] = useState('')
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [section, setSection] = useState<SettingsSection>('general')
  const [appsOpen, setAppsOpen] = useState(false)
  const navRefs = useRef<Partial<Record<SettingsSection, HTMLButtonElement | null>>>({})

  useEffect(() => {
    if (settings !== null && state.showSettings) {
      setBaseUrl(settings.ai.baseUrl)
      setModel(settings.ai.model)
      setCustomInstructions(settings.ai.customInstructions)
      setConfirmOverride(settings.confirmOverrideWithGeneratedMessage)
      setAutoRefresh(settings.autoRefresh)
      setAutoFetchMinutes(settings.autoFetchMinutes)
      setHintsEnabled(settings.hintsEnabled)
      setAutoUpdateChecks(settings.autoUpdateChecks)
      setTheme(settings.theme)
      setScanFolder(settings.scanFolder)
      setApiKey('')
      setGitHubClientId('')
      setGitLabClientId('')
      setTestResult(null)
      // Land where the visitor came for: the AI pointer note opens the AI
      // rail item, otherwise General — the first item, where the app-level
      // switches live. The sign-in-apps drawer stays closed by default — an
      // unconfigured browser button now explains itself by opening the
      // one-step setup right in the sign-in panel, so nothing here has to
      // pre-emptively apologise for a greyed button.
      setSection(state.settingsAiNote ? 'ai' : 'general')
      setAppsOpen(false)
    }
  }, [settings, state.showSettings, state.settingsAiNote])

  // The packaged version, so the update line can name the release it just
  // checked against instead of trailing off. Asked once per open, exactly as
  // the About card asks it.
  useEffect(() => {
    if (!state.showSettings) return
    let alive = true
    void call('getAppVersion')
      .then(v => {
        if (alive) setAppVersion(v)
      })
      .catch(() => {
        /* the update line keeps its version-free wording */
      })
    return () => {
      alive = false
    }
  }, [state.showSettings])

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
                  autoFetchMinutes,
                  hintsEnabled,
                  autoUpdateChecks,
                  theme,
                  // Only when it actually moved: an untouched box must not
                  // trigger main's folder resync on every Save.
                  ...(scanFolder !== settings.scanFolder ? { scanFolder } : {})
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
      {section === 'general' && (
      <section className="settings-section">
        <h3>General</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={autoUpdateChecks}
            onChange={e => setAutoUpdateChecks(e.target.checked)}
          />
          <span>Check GitHub releases for updates at startup</span>
          <InfoTip text={'Aspen asks the public releases page of this app\u2019s GitHub repository whether a newer version exists. Nothing identifies you, and nothing downloads or installs itself.'} />
        </label>
        <p className="field-hint">
          Switches the automatic pass only, in installed builds, and takes
          effect at the next launch. Checking by hand below always works.
        </p>
        <UpdateRow currentVersion={appVersion} />
        <label className="check-row">
          <input
            type="checkbox"
            checked={hintsEnabled}
            onChange={e => setHintsEnabled(e.target.checked)}
          />
          <span>Show tips for getting started</span>
          <InfoTip text={'Hides the one-time coach banner, the first-run captions, and the pointer notes in these pages. Git facts, counts and errors stay visible regardless.'} />
        </label>
        <Field
          label="Watch folder for repositories"
          hint="Its direct subfolders that are git repositories keep the list in step \u2014 new ones appear, folders that leave the disk are dropped. Applies when you press Save; Rescan stays in the repository manager."
          tip={'Leave empty to keep the list exactly as you built it.\nOne level deep: the folder\u2019s own subfolders, each recognised by its .git \u2014 a worktree or submodule folder counts, nested projects deeper down do not.'}
        >
          <div className="row">
            <input
              readOnly
              placeholder="No folder watched"
              value={scanFolder}
              onClick={async () => {
                const dir = await call('selectDirectory')
                if (dir !== null) setScanFolder(dir)
              }}
            />
            <button
              className="btn"
              onClick={async () => {
                const dir = await call('selectDirectory')
                if (dir !== null) setScanFolder(dir)
              }}
            >
              Choose\u2026
            </button>
            {scanFolder.length > 0 && (
              <button
                className="mini"
                onClick={() => setScanFolder('')}
                title="Keep the list as it is; stops watching on Save"
              >
                Stop watching
              </button>
            )}
          </div>
        </Field>
      </section>
      )}

      {section === 'ai' && (
      <section className="settings-section">
        <h3>AI agent</h3>
        <p className="field-hint">
          Optional \u2014 this is what powers \u2728 Generate in the commit tray and
          \u2728 AI on conflicted files. The rest of Aspen works without any of
          it.
        </p>
        {state.settingsAiNote && (
          <div className="workflow-banner settings-note">
            <strong>The AI agent needs an endpoint first.</strong>
            <span>
              Point Base URL at any OpenAI-compatible server \u2014 OpenAI,
              OpenRouter, or a local Ollama or LM Studio \u2014 add an API key if
              your server asks for one, then press Test connection.
            </span>
          </div>
        )}
        <Field
          label="Base URL"
          hint="Any OpenAI-compatible server: https://api.openai.com/v1, https://openrouter.ai/api/v1, http://localhost:11434/v1 \u2026"
          tip={'\u2728 Generate sends your staged diff and draft message to this one host \u2014 no other git content leaves the machine because of the AI.\nLocal servers (Ollama, LM Studio) answer the same shape and need no key.'}
        >
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
        </Field>
        <Field
          label="Model"
          hint="e.g. gpt-4o-mini, claude-3-5-haiku, llama3.1, qwen2.5-coder"
          tip={'Any model id your endpoint serves. Small, fast chat models write good commit messages \u2014 a 7\u201314B coder model locally beats a huge one over the wire.'}
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
            placeholder={settings.ai.hasApiKey ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : 'sk-\u2026'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
        </Field>
        <Field
          label="Custom commit message rules (optional)"
          hint="Fixed rules added to the AI's instructions for this app, e.g. conventional commits, issue trailer format."
          tip={'Plain text appended to the agent\u2019s fixed system prompt for every generation in this app. Example: \u201csummary \u2264 50 chars, body wrapped at 72, add Closes #NNN trailers\u201d.'}
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
                  setTestResult(`${r.ok ? '\u2713 ' : '\u2717 '}${r.message}`)
                })
                .finally(() => setTesting(false))
            }}
          >
            {testing ? 'Testing\u2026' : 'Test connection'}
          </button>
          {testResult !== null && (
            <span className={testResult.startsWith('\u2713') ? 'ok' : 'bad'}>
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
            <InfoTip text={'Both sign-in buttons are always clickable. With an id here GitHub goes straight to the one-time code and GitLab straight to your browser for authorization; without one the button first asks for the id, in place. Aspen ships no shared id, so your sign-ins never ride on someone else\u2019s rate limits \u2014 and the token sign-in above needs none of this.'} />
          </summary>
          <p className="field-hint">
            The browser buttons sign you in through an OAuth application you register
            once and paste here (or bake into providers/config.ts and rebuild) \u2014 the
            sign-in panel walks you through the same registration when a box is empty.
            Aspen ships no shared id so your sign-ins never ride on someone else's
            rate limits.
          </p>
          <Field
            label="GitHub OAuth App client id"
            hint="Already filled in: Aspen ships GitHub\u2019s own device-flow app id, so the button shows a code on a fresh install. Paste your own app\u2019s id to have GitHub name it instead (tick \u201cEnable Device Flow\u201d; any callback URL); required on GitHub Enterprise. Clear the box to go back to the built-in id."
            tip={'A device-code sign-in needs an OAuth App with \u201cEnable Device Flow\u201d ticked.\nOut of the box Aspen uses the public id GitHub\u2019s own CLI embeds, so the approval page says \u201cGitHub CLI\u201d and the token is listed under that app.\nTo change that: Settings \u2192 Developer settings \u2192 OAuth Apps \u2192 New OAuth App. Homepage URL and callback URL: anything.\nTick \u201cEnable Device Flow\u201d, then paste the Client ID here \u2014 Aspen never needs the secret.\nOn GitHub Enterprise the built-in id names no app, so registering one there is required.'}
          >
            <input
              placeholder={
                settings.accounts.hasGitHubClientId
                  ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 configured \u2014 paste a new id to replace'
                  : 'Iv23li\u2026'
              }
              value={githubClientId}
              onChange={e => setGitHubClientId(e.target.value)}
            />
          </Field>
          <Field
            label="GitLab application id"
            hint="gitlab.com Profile \u2192 Applications \u2192 confidential OFF, redirect URI exactly http://127.0.0.1:8765/callback, scope api."
            tip={'GitLab \u2192 Preferences \u2192 Applications.\nConfidential: OFF \u2014 Aspen is a public PKCE client.\nRedirect URI: exactly http://127.0.0.1:8765/callback; tick the api scope.\nPaste the numeric Application ID.'}
          >
            <input
              placeholder={
                settings.accounts.hasGitLabClientId
                  ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 configured \u2014 paste a new id to replace'
                  : 'app id\u2026'
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
          <InfoTip text={'When off, \u2728 Generate replaces a message you have typed without asking. When on, a typed summary or description makes Aspen confirm first.'} />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
          />
          <span>Refresh the changes list automatically when files change on disk</span>
          <InfoTip text={'When off, the changes list refreshes after git actions and when you press Refresh \u2014 handy if watching a very large working tree feels heavy.'} />
        </label>
        <Field
          label="Check the remote for new commits"
          hint={'Also once each time you switch repository, so the counts on arrival are today\'s. Nothing downloads into your working tree \u2014 Pull still does that.'}
          tip={'An automatic fetch updates the remote-tracking refs the \u2193 chip, the route readout and the Pull verb read \u2014 it never merges, rebases or touches your files. It stays silent: no spinner, no toast, and a failed one (offline, an expired token) simply tries again on the next tick. The Fetch button in the bar always works, whatever is set here, and says out loud what a background fetch swallowed.'}
        >
          <select
            value={String(autoFetchMinutes)}
            onChange={e => {
              const next = Number(e.target.value)
              if (isAutoFetchMinutes(next)) setAutoFetchMinutes(next)
            }}
          >
            {AUTO_FETCH_CHOICES.map(minutes => (
              <option key={minutes} value={String(minutes)}>
                {AUTO_FETCH_LABELS[minutes]}
              </option>
            ))}
          </select>
        </Field>
      </section>
      )}

      {section === 'appearance' && (
      <section className="settings-section">
        <h3>Appearance</h3>
        <Field
          label="Theme"
          hint="Applies the moment you press Save; Cancel leaves the current theme alone."
          tip={'System follows the OS light/dark setting.\nCommunity palettes re-ink every colour role at once \u2014 they change how the app looks, never how it behaves.'}
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
    // The destination defaults to the folder used last, then the watch
    // folder \u2014 the same rule the Create dialog runs, so the Clone verb is
    // live the moment a URL lands in the box instead of waiting on a picker.
    setBaseDir(
      window.localStorage.getItem('aspen.lastCloneDir') ??
        state.settings?.scanFolder ??
        ''
    )
    // The tab list must reflect accounts added since the app booted \u2014 and
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

  // First view of an account tab fetches its first page automatically. Every
  // hook of this component sits above the closed-render `return null` below:
  // a hook beneath it changes the hook count between the closed and open
  // render, React then throws "Rendered more hooks than during the previous
  // render", and \u2014 with no error boundary \u2014 the whole window goes blank the
  // moment Clone is clicked. That is what used to make the Clone verb look
  // dead from every one of its entry points.
  useEffect(() => {
    if (!state.showClone) return
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

  // All hooks have run: only now is it safe to skip the closed render.
  if (!state.showClone) return null

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
              state.busy !== null ||
              url.trim().length === 0 ||
              baseDir.length === 0 ||
              derivedName.trim().length === 0
            }
            title={
              url.trim().length === 0
                ? 'Paste a URL or pick one from an account tab first'
                : baseDir.length === 0
                  ? 'Choose the folder to clone into first'
                  : state.busy !== null
                    ? 'Wait for the current operation to finish'
                    : `Clone into ${baseDir}`
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
            {a.provider === 'github' ? 'GitHub' : 'GitLab'} \u00b7 {a.login}
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
          hint="https://github.com/owner/repo.git or git@github.com:owner/repo.git \u2014 authentication uses your git credential helper, falling back to your signed-in account's token."
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
            // pipeline as typing one \u2014 the footer Clone then works unchanged.
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
      <Field
        label="Local path"
        hint={
          baseDir.length === 0
            ? 'Pick the folder that will hold it \u2014 a folder named after the repository is created inside, so Clone unlocks once a URL and a destination are set.'
            : 'The repository folder is created inside this one.'
        }
      >
        <div className="row">
          <input
            readOnly
            placeholder="Choose a folder\u2026"
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
            Choose\u2026
          </button>
        </div>
      </Field>
      {state.busy === 'clone' && <p className="busy-line">Cloning\u2026</p>}
    </Dialog>
  )
}

/**
 * Fork \u2014 the recovery behind a permission-rejected push and the Repository
 * menu's own verb. Main's preflight already proved the flow can run here
 * (a parseable origin, a free-or-matching `upstream` name, a checked-out
 * branch, at least one GitHub account on the host), so this dialog is just
 * the last question: *into which account?* One click forks the repository,
 * rewires origin \u2192 fork / parent \u2192 upstream, and pushes the current branch
 * (src/main/git/fork.ts).
 */
export function ForkDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  if (!state.showFork || state.forkPreflight === null) return null
  const pre = state.forkPreflight
  const busy = state.busy === 'fork'

  return (
    <Dialog
      title="Fork this repository"
      width={520}
      maxWidth={520}
      onClose={() => store.closeForkDialog()}
      footer={
        <button className="btn" onClick={() => store.closeForkDialog()}>
          Cancel
        </button>
      }
    >
      <p className="confirm-message">
        You cannot push to <strong>{pre.parentFullName}</strong> \u2014 forking it
        gives you a copy you own. Aspen will point <code>origin</code> at your
        fork, keep the parent as the <code>upstream</code> remote, and push
        your current branch. Afterwards, Pull &amp; Push work against your
        fork; <em>Create Pull Request</em> opens the parent&apos;s new-PR form
        with your branch pre-filled.
      </p>
      <div className="dialog-branch-list">
        {pre.accounts.map(a => (
          <button
            key={a.id}
            className="popover-item"
            disabled={busy}
            title={`Fork ${pre.parentFullName} into ${a.login} and push there`}
            onClick={() => void store.createFork(a.id)}
          >
            <span className="branch-line">
              <span className="branch-name">
                Fork into GitHub \u00b7 {a.login}
              </span>
            </span>
          </button>
        ))}
      </div>
      {busy && <p className="busy-line">Forking, rewiring remotes, pushing\u2026</p>}
    </Dialog>
  )
}

/**
 * Create / Publish \u2014 one dialog, two modes, mirroring how the Clone dialog
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
  // last, then the watch folder \u2014 a newcomer who set one never picks again.
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
      /* private-mode localStorage \u2014 the default just stays the scan folder */
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
                ? 'Publishing\u2026'
                : 'Creating\u2026'
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
            {a.provider === 'github' ? 'GitHub' : 'GitLab'} \u00b7 {a.login}
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
          hint="Where the repository lives \u2014 your account, or an organization/group you can create in."
        >
          <div className="row">
            <select
              value={owner}
              onChange={e => setOwner(e.target.value)}
              disabled={ownerList === null}
            >
              {ownerList === null ? (
                <option value="">Loading owners\u2026</option>
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
              \u21bb
            </button>
          </div>
        </Field>
      )}

      <Field
        label="Name"
        hint="Letters, numbers, dots, dashes and underscores \u2014 this becomes the repository and folder name."
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
        <span>Private repository \u2014 visible only to you and people you invite</span>
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
                placeholder="Choose a folder\u2026"
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
                Choose\u2026
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
            : 'Sign in above to publish right away \u2014 or create it locally and publish later.'}
        </p>
      )}
    </Dialog>
  )
}

/**
 * Creates a branch from a chosen base: any local branch, a remote-tracking
 * branch (which gets local tracking, like a checkout from the branch list),
 * or \u2014 when opened from History \u2014 the selected commit. The base defaults to
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
 * through store.requestMergeBranch); opening it from Repository \u25b8 Merge\u2026 or
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
            aria-label={branchAriaLabel(b)}
            title={`Merge "${b.name}" into "${current}"${divergenceTitleSuffix(b)}`}
            onClick={() => setSelected({ name: b.name })}
          >
            <span className="branch-line">
              <span className="branch-name">{b.name}</span>
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
                aria-label={branchAriaLabel(b)}
                title={`Merge the remote-tracking branch ${b.remote}/${b.name} into "${current}"${divergenceTitleSuffix(b)}`}
                onClick={() =>
                  setSelected({ name: b.name, remote: b.remote })
                }
              >
                <span className="branch-line">
                  <span className="branch-name">{b.name}</span>
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
        <strong>{current}</strong> \u2014 fast-forward when possible, a merge
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
 * "Stash your changes": park every working change \u2014 untracked included \u2014
 * under an optional message. \u2728 describes all dirty paths with the same
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
        tip="Stored as the stash commit's message body \u2014 visible in the stash detail pane and in git log."
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
            \u2728 Describe
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
    return 'Aspen checks GitHub releases a few seconds after launch when that pass is switched on; you can check any time from here.'
  }
  switch (update.phase) {
    case 'checking':
      return 'Checking GitHub releases\u2026'
    case 'available':
      if (update.authenticated === false) {
        return `Aspen ${update.version ?? 'x'} is available but not signed \u2014 install it from the releases page.`
      }
      return update.canInstall
        ? `Aspen ${update.version ?? 'x'} is available \u2014 choose an action below.`
        : `Aspen ${update.version ?? 'x'} is available \u2014 this build updates from the releases page.`
    case 'downloading':
      return `Downloading Aspen ${update.version ?? 'x'} \u2014 ${update.percent ?? 0}%.`
    case 'ready':
      return `Aspen ${update.version ?? 'x'} is ready \u2014 restart to install it.`
    case 'up-to-date':
      return `Aspen ${currentVersion ?? ''} is the newest release.`
    case 'error':
      return update.error ?? 'The update check failed.'
  }
}

/** Where the update flow stands and what you can do about it, as one unit:
 *  the honest status sentence, a live download bar, and the verb that fits
 *  the current phase. Shared by Preferences \u25b8 General and the About card, so
 *  the two can never offer different update buttons. */
function UpdateRow({
  currentVersion
}: {
  readonly currentVersion: string | null
}): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const update = state.update

  return (
    <>
      <p className="confirm-message">{updateSummary(update, currentVersion)}</p>
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
        ) : update?.phase === 'available' && update.canInstall && update.authenticated === true ? (
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
    </>
  )
}

export function AboutDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [appVersion, setAppVersion] = useState<string | null>(null)

  // The packaged version, asked from main once per dialog open \u2014 the About
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
        <strong>Aspen Git</strong> \u2014 a visual desktop client for Git, with an
        AI commit-message and merge agent.
      </p>
      <p className="confirm-message">
        Version {appVersion ?? '\u2026'} \u00b7 git operations run through your system{' '}
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
            <code>Ctrl+Shift+G</code> view on GitHub \u00b7 <code>Ctrl+R</code> refresh
          </li>
          <li>
            <code>Ctrl+,</code> preferences
          </li>
        </ul>
      </div>
      <div className="settings-section">
        <h3>Updates</h3>
        <UpdateRow currentVersion={appVersion} />
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
            \u2665 Donate via PayPal
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
      title="\u2728 AI merge agent"
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
            <span className="spinner" /> thinking\u2026
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
              <span className="spinner" /> thinking\u2026
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
