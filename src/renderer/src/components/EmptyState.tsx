import type { JSX } from 'react'
import { useStore } from '../store'

export function EmptyState(): JSX.Element {
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
        </div>
        <button
          className="link"
          onClick={() => store.setSettingsOpen(true)}
        >
          Configure the AI agent in Preferences
        </button>
      </div>
    </div>
  )
}
