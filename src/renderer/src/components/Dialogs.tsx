import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { call } from '../api'
import { useStore, useStoreState } from '../store'
import { Dialog, Field } from './Dialog'

export function SettingsDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const settings = state.settings

  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [confirmOverride, setConfirmOverride] = useState(true)
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (settings !== null && state.showSettings) {
      setBaseUrl(settings.ai.baseUrl)
      setModel(settings.ai.model)
      setCustomInstructions(settings.ai.customInstructions)
      setConfirmOverride(settings.confirmOverrideWithGeneratedMessage)
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
                .saveSettings({
                  ai: {
                    baseUrl,
                    model,
                    customInstructions,
                    ...(apiKey.length > 0 ? { apiKey } : {})
                  }
                })
                .then(async s => {
                  if (s === null) return
                  const r = await store.testAiConnection()
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
      </section>

      <section className="settings-section">
        <h3>Appearance</h3>
        <Field label="Theme">
          <select
            value={theme}
            onChange={e =>
              setTheme(e.target.value as 'system' | 'light' | 'dark')
            }
          >
            <option value="system">System default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
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
  const [baseDir, setBaseDir] = useState('')
  const [folderTouched, setFolderTouched] = useState(false)

  useEffect(() => {
    if (!state.showClone) {
      setUrl('')
      setFolderName('')
      setBaseDir('')
      setFolderTouched(false)
    }
  }, [state.showClone])

  if (!state.showClone) return null

  const derivedName = suggestedFolder(url)

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
              (folderTouched ? folderName : derivedName).length === 0
            }
            onClick={() =>
              void store.clone(
                url,
                baseDir,
                folderTouched ? folderName : derivedName
              )
            }
          >
            Clone
          </button>
        </>
      }
    >
      <Field label="Repository URL">
        <input
          autoFocus
          placeholder="https://github.com/owner/repo.git"
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
      </Field>
      <Field label="Name">
        <input
          placeholder={derivedName || 'repository'}
          value={folderTouched ? folderName : derivedName}
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

function suggestedFolder(url: string): string {
  const cleaned = url.trim().replace(/\/+$/, '').replace(/\.git$/, '')
  const last = cleaned.split(/[/:]/).pop() ?? ''
  return last.replace(/[^a-zA-Z0-9._-]/g, '')
}

export function NewBranchDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [name, setName] = useState('')

  useEffect(() => {
    if (!state.showNewBranch) setName('')
  }, [state.showNewBranch])

  if (!state.showNewBranch) return null

  return (
    <Dialog
      title={`Create branch from "${state.status?.branch ?? 'HEAD'}"`}
      onClose={() => store.setNewBranchOpen(false)}
      footer={
        <>
          <button className="btn" onClick={() => store.setNewBranchOpen(false)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={name.trim().length === 0}
            onClick={() => void store.createBranch(name)}
          >
            Create branch
          </button>
        </>
      }
    >
      <Field label="Branch name" hint="From the current branch">
        <input
          autoFocus
          placeholder="my-new-branch"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && name.trim().length > 0)
              void store.createBranch(name)
          }}
        />
      </Field>
    </Dialog>
  )
}

export function ConfirmDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()

  if (state.confirm === null) return null
  const { title, message, confirmLabel, onConfirm } = state.confirm

  return (
    <Dialog
      title={title}
      onClose={() => store.dismissConfirm()}
      footer={
        <>
          <button className="btn" onClick={() => store.dismissConfirm()}>
            Cancel
          </button>
          <button className="btn primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Dialog>
  )
}
