import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { call } from '../api'
import { useStore, useStoreState } from '../store'
import type { ThemeId } from '../../../shared/themes'
import { isThemeId, THEME_ENTRIES } from '../../../shared/themes'
import { Dialog, Field } from './Dialog'
import { BranchDivergence, divergenceTitleSuffix } from './BranchBadges'

import { DONATE_URL } from '../../../shared/links'

const autoEntries = THEME_ENTRIES.filter(e => e.group === 'auto')
const lightEntries = THEME_ENTRIES.filter(e => e.group === 'light')
const darkEntries = THEME_ENTRIES.filter(e => e.group === 'dark')

export function SettingsDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const settings = state.settings

  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [confirmOverride, setConfirmOverride] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [theme, setTheme] = useState<ThemeId>('system')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (settings !== null && state.showSettings) {
      setBaseUrl(settings.ai.baseUrl)
      setModel(settings.ai.model)
      setCustomInstructions(settings.ai.customInstructions)
      setConfirmOverride(settings.confirmOverrideWithGeneratedMessage)
      setAutoRefresh(settings.autoRefresh)
      setTheme(settings.theme)
      setApiKey('')
      setTestResult(null)
    }
  }, [settings, state.showSettings])

  if (!state.showSettings || settings === null) return null

  return (
    <Dialog
      title="Preferences"
      width={560}
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
                  confirmOverrideWithGeneratedMessage: confirmOverride,
                  autoRefresh,
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
      <section className="settings-section">
        <h3>AI commit agent</h3>
        <Field
          label="Base URL"
          hint="Any OpenAI-compatible server: https://api.openai.com/v1, https://openrouter.ai/api/v1, http://localhost:11434/v1 …"
        >
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
        </Field>
        <Field label="Model" hint="e.g. gpt-4o-mini, claude-3-5-haiku, llama3.1, qwen2.5-coder">
          <input value={model} onChange={e => setModel(e.target.value)} />
        </Field>
        <Field
          label="API key"
          hint={
            settings.ai.hasApiKey
              ? 'Stored securely. Type a new key to replace it.'
              : 'Stored encrypted on this machine (never sent to the UI).'
          }
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

      <section className="settings-section">
        <h3>Behavior</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={confirmOverride}
            onChange={e => setConfirmOverride(e.target.checked)}
          />
          Confirm before replacing a typed commit message with a generated one
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
          />
          Refresh the changes list automatically when files change on disk
        </label>
      </section>

      <section className="settings-section">
        <h3>Appearance</h3>
        <Field label="Theme">
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
    </Dialog>
  )
}

export function CloneDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [url, setUrl] = useState('')
  const [folderName, setFolderName] = useState('')
  const [suggested, setSuggested] = useState('')
  const [baseDir, setBaseDir] = useState('')
  const [folderTouched, setFolderTouched] = useState(false)

  useEffect(() => {
    if (!state.showClone) {
      setUrl('')
      setFolderName('')
      setSuggested('')
      setBaseDir('')
      setFolderTouched(false)
      return
    }
    // Ask main for the folder name so the clone dialog and `git clone`
    // agree on one rule.
    const timer = setTimeout(() => {
      if (url.trim().length === 0) return
      void call('suggestCloneFolder', url)
        .then(name => setSuggested(name))
        .catch(() => setSuggested(''))
    }, 200)
    return () => clearTimeout(timer)
  }, [state.showClone, url])

  if (!state.showClone) return null

  const derivedName = folderTouched ? folderName : suggested

  return (
    <Dialog
      title="Clone a repository"
      width={540}
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
      <Field
        label="Repository URL"
        hint="https://github.com/owner/repo.git or git@github.com:owner/repo.git — authentication uses your git credential helper."
      >
        <input
          autoFocus
          placeholder="https://github.com/owner/repo.git"
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
      </Field>
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

export function NewBranchDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [name, setName] = useState('')

  useEffect(() => {
    if (!state.showNewBranch) setName('')
  }, [state.showNewBranch])

  if (!state.showNewBranch) return null

  const base = state.newBranchBase ?? state.status?.branch ?? 'HEAD'

  return (
    <Dialog
      title={`Create branch from "${base}"`}
      onClose={() => store.setNewBranchOpen(false)}
      footer={
        <>
          <button className="btn" onClick={() => store.setNewBranchOpen(false)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={name.trim().length === 0}
            onClick={() =>
              void store.createBranch(
                name,
                state.newBranchBase ?? undefined
              )
            }
          >
            Create branch
          </button>
        </>
      }
    >
      <Field
        label="Branch name"
        hint={
          state.newBranchBase !== null
            ? `Starting at commit ${state.newBranchBase}, and switching to it.`
            : 'From the current branch.'
        }
      >
        <input
          autoFocus
          placeholder="my-new-branch"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && name.trim().length > 0)
              void store.createBranch(name, state.newBranchBase ?? undefined)
          }}
        />
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

export function AboutDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()

  if (!state.showAbout) return null

  return (
    <Dialog
      title="About GitDesk"
      width={420}
      onClose={() => store.setAboutOpen(false)}
      footer={
        <button className="btn primary" onClick={() => store.setAboutOpen(false)}>
          Close
        </button>
      }
    >
      <p className="confirm-message">
        <strong>GitDesk</strong> — a GitHub Desktop-style git client with an
        AI commit-message agent.
      </p>
      <p className="confirm-message">
        Version 0.1.0 · git operations run through your system{' '}
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
        <h3>Support the development</h3>
        <p className="confirm-message">
          GitDesk is free and open source. If it saves you time, consider a
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
