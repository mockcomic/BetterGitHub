import type { JSX } from 'react'
import { useStore, useStoreState } from '../store'

export function EmptyState(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  return (
    <div className="empty-state">
      <div className="onboarding">
        <h1>GitDesk</h1>
        <p>
          A GitHub Desktop-style client with an AI commit-message agent. Add a
          repository you already have, or clone one from a URL.
        </p>
        <div className="onboarding-actions">
          <button
            className="btn primary"
            onClick={() => void store.addLocalRepository()}
          >
            Add local repository…
          </button>
          <button className="btn" onClick={() => store.setCloneOpen(true)}>
            Clone repository…
          </button>
          <button className="btn" onClick={() => store.setRepoManagerOpen(true)}>
            Manage repositories…
          </button>
        </div>

        {state.repositories.some(r => !r.missing) && (
          <div className="recent-repos">
            <h2>Recent repositories</h2>
            {state.repositories
              .filter(r => !r.missing)
              .map(r => (
                <button
                  key={r.id}
                  className="recent-repo"
                  onClick={() => void store.selectRepo(r)}
                >
                  <strong>{r.name}</strong>
                  <small title={r.path}>{r.path}</small>
                </button>
              ))}
          </div>
        )}

        {state.initError !== null && (
          <p className="busy-line">{state.initError}</p>
        )}

        <div className="onboarding-links">
          <button className="link" onClick={() => store.setSettingsOpen(true)}>
            Configure the AI agent in Preferences
          </button>
          <button className="link" onClick={() => store.setAboutOpen(true)}>
            Keyboard shortcuts
          </button>
        </div>
      </div>
    </div>
  )
}
