import type { JSX } from 'react'
import { useEffect } from 'react'
import { Header } from './components/Header'
import { ChangesSidebar } from './components/ChangesSidebar'
import { DiffView } from './components/DiffView'
import { HistoryView } from './components/HistoryView'
import { Toasts } from './components/Toasts'
import {
  CloneDialog,
  ConfirmDialog,
  NewBranchDialog,
  SettingsDialog
} from './components/Dialogs'
import { EmptyState } from './components/EmptyState'
import { useStore, useStoreState } from './store'

export function App(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  useEffect(() => {
    void store.init()
  }, [store])

  if (state.selectedRepo === null) {
    return (
      <div className="app">
        <Header />
        <EmptyState />
        <Toasts />
        <SettingsDialog />
        <CloneDialog />
        <NewBranchDialog />
        <ConfirmDialog />
      </div>
    )
  }

  return (
    <div className="app">
      <Header />
      <div className="body">
        <ChangesSidebar />
        <main className="main-pane">
          {state.activeTab === 'changes' ? (
            <DiffView
              diff={state.selectedFileDiff}
              title={state.selectedFilePath}
              emptyTitle="Select a changed file"
              emptyHint="Pick a file from the list to see what changed before committing."
            />
          ) : (
            <HistoryView />
          )}
        </main>
      </div>
      <StatusBar />
      <Toasts />
      <SettingsDialog />
      <CloneDialog />
      <NewBranchDialog />
      <ConfirmDialog />
    </div>
  )
}

function StatusBar(): JSX.Element | null {
  const state = useStoreState()
  const { status, selectedRepo } = state
  if (selectedRepo === null) return null
  const dirty = status?.files.length ?? 0
  return (
    <footer className="status-bar">
      <span className="status-item" title={selectedRepo.path}>
        {selectedRepo.name}
      </span>
      <span className="status-item">{status?.branch ?? '—'}</span>
      <span className="status-item">
        {dirty === 0 ? 'Clean' : `${dirty} changed file${dirty === 1 ? '' : 's'}`}
      </span>
      {state.busy !== null && (
        <span className="status-item busy">{state.busy}…</span>
      )}
      <span className="status-item right">GitDesk</span>
    </footer>
  )
}
