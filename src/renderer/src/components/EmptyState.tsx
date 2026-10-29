import type { JSX } from 'react'
import { useStore, useStoreState } from '../store'

/**
 * The first-run desk. A newcomer should leave this screen knowing two things:
 * where their code comes from (a folder they have, or a URL), and what the
 * app will then ask of them — the same three steps the queue's coaching
 * banner repeats once there is something to commit.
 */
export function EmptyState(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  return (
    <div className="empty-state">
      <div className="onboarding">
        <h1>GitDesk</h1>
        <p>
          See what changed in your code, commit it, and push it to GitHub —
          no command line. The ✨ button can even write the commit message
          for you.
        </p>
        <div className="onboarding-actions">
          <div className="onboarding-action">
            <button
              className="btn primary"
              onClick={() => void store.addLocalRepository()}
            >
              Add local repository…
            </button>
            <small>A project folder you already have on this computer</small>
          </div>
          <div className="onboarding-action">
            <button className="btn" onClick={() => store.setCloneOpen(true)}>
              Clone repository…
            </button>
            <small>Download a repository from a URL</small>
          </div>
        </div>

        <ol className="onboarding-steps">
          <li>Add a repository</li>
          <li>Tick the files you want to include</li>
          <li>Write a summary — or press ✨ Generate</li>
          <li>Commit, then Push sends it to GitHub</li>
        </ol>

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
          <button className="link" onClick={() => store.setRepoManagerOpen(true)}>
            Manage repositories…
          </button>
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
