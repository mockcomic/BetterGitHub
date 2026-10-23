import type { JSX } from 'react'
import type { CSSProperties } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Header } from './components/Header'
import { TitleBar } from './components/TitleBar'
import {
  ChangesQueue,
  CommitTray,
  ConflictsQueue,
  HistoryQueue,
  ResolveHelp,
  StashDetail,
  StashQueue
} from './components/ChangesSidebar'
import { DiffView } from './components/DiffView'
import { HistoryView } from './components/HistoryView'
import { ResizeHandle } from './components/ResizeHandle'
import type { WidthRange } from './components/ResizeHandle'
import { Toasts } from './components/Toasts'
import {
  AboutDialog,
  CloneDialog,
  ConfirmDialog,
  NewBranchDialog,
  RenameBranchDialog,
  SettingsDialog
} from './components/Dialogs'
import { RepoManagerDialog } from './components/RepoManagerDialog'
import { EmptyState } from './components/EmptyState'
import { useStore, useStoreState } from './store'
import type { DeskView } from './store'

const DESK_TABS: ReadonlyArray<{ id: DeskView; label: string }> = [
  { id: 'review', label: 'Review' },
  { id: 'history', label: 'History' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'stash', label: 'Stash' }
]

/* The docked panels are drag-resizable within these bounds; `def` is the
   DESIGN.md measure the responsive defaults fall back to. */
const QUEUE_KEY = 'gitdesk.layout.queueWidth'
const TRAY_KEY = 'gitdesk.layout.trayWidth'
const QUEUE_RANGE: WidthRange = { min: 220, max: 480, def: 340 }
const TRAY_RANGE: WidthRange = { min: 220, max: 420, def: 300 }

function readStoredWidth(key: string, range: WidthRange): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    const value = Number(raw)
    if (!Number.isFinite(value)) return null
    return Math.min(range.max, Math.max(range.min, Math.round(value)))
  } catch {
    return null
  }
}

function writeStoredWidth(key: string, value: number | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, String(value))
  } catch {
    // Storage unavailable — the width just lives for this session.
  }
}

export function App(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  useEffect(() => {
    void store.init()
  }, [store])
  // Keep the tray's scope line honest: recompute +A −D whenever the checked
  // set or the underlying status changes.
  useEffect(() => {
    void store.recomputeScope()
  }, [store, state.selectedRepo, state.status, state.drafts])

  // Dragged panel widths. The live drag writes the variable straight on the
  // work area (see ResizeHandle); React only holds the committed value so it
  // survives view switches and restarts. The style object is memoised so a
  // mid-drag re-render cannot wipe the handle's direct writes.
  const [queueWidth, setQueueWidth] = useState<number | null>(() =>
    readStoredWidth(QUEUE_KEY, QUEUE_RANGE)
  )
  const [trayWidth, setTrayWidth] = useState<number | null>(() =>
    readStoredWidth(TRAY_KEY, TRAY_RANGE)
  )
  const workStyle = useMemo(
    () =>
      ({
        ...(queueWidth !== null ? { '--queue-w': `${queueWidth}px` } : {}),
        ...(trayWidth !== null ? { '--tray-w': `${trayWidth}px` } : {})
      }) as CSSProperties,
    [queueWidth, trayWidth]
  )
  const commitQueueWidth = (value: number | null): void => {
    setQueueWidth(value)
    writeStoredWidth(QUEUE_KEY, value)
  }
  const commitTrayWidth = (value: number | null): void => {
    setTrayWidth(value)
    writeStoredWidth(TRAY_KEY, value)
  }

  if (state.selectedRepo === null) {
    return (
      <div className="app" data-view="empty">
        <TitleBar />
        <Header />
        <EmptyState />
        <Toasts />
        <SettingsDialog />
        <CloneDialog />
        <RepoManagerDialog />
        <NewBranchDialog />
        <RenameBranchDialog />
        <AboutDialog />
        <ConfirmDialog />
      </div>
    )
  }

  const view = state.view
  const conflictCount = state.status?.conflictCount ?? 0

  return (
    <div className="app" data-view={view}>
      <TitleBar />
      <Header />
      {state.initError !== null && (
        <div className="app-banner error">
          <strong>GitDesk could not start correctly.</strong> {state.initError}{' '}
          <button className="mini" onClick={() => void store.init()}>
            Retry
          </button>
        </div>
      )}
      <SegmentedSwitch />
      <div className="body work-area" style={workStyle}>
        <aside className="queue-col pane-enter" key={`queue-${view}`}>
          {view === 'review' && <ChangesQueue />}
          {view === 'history' && <HistoryQueue />}
          {view === 'conflicts' && <ConflictsQueue />}
          {view === 'stash' && <StashQueue />}
        </aside>
        <ResizeHandle
          side="prev"
          range={QUEUE_RANGE}
          label="Queue width"
          cssVar="--queue-w"
          width={queueWidth}
          onCommit={commitQueueWidth}
        />
        <main
          className="main-pane pane-enter"
          id="desk-panel"
          key={view}
          role="tabpanel"
          aria-labelledby={`desk-tab-${view}`}
        >
          {view === 'review' && (
            <DiffView
              diff={state.selectedFileDiff}
              title={state.selectedFilePath}
              error={state.selectedFileError}
              onRetry={
                state.selectedFilePath !== null
                  ? () => void store.selectFile(state.selectedFilePath!)
                  : undefined
              }
              onOpenFile={
                state.selectedFilePath !== null
                  ? () => void store.openFile(state.selectedFilePath!)
                  : undefined
              }
              emptyTitle="Select a changed file"
              emptyHint="Pick a file from the list to see what changed before committing."
            />
          )}
          {view === 'conflicts' && (
            <DiffView
              diff={state.selectedFileDiff}
              title={state.selectedFilePath}
              error={state.selectedFileError}
              onRetry={
                state.selectedFilePath !== null
                  ? () => void store.selectFile(state.selectedFilePath!)
                  : undefined
              }
              onOpenFile={
                state.selectedFilePath !== null
                  ? () => void store.openFile(state.selectedFilePath!)
                  : undefined
              }
              emptyTitle={conflictCount === 0 ? 'Nothing is conflicted' : 'Select a conflicted file'}
              emptyHint={
                conflictCount === 0
                  ? 'The worktree is clear — resolve nothing, and commit when you are ready.'
                  : 'Pick a conflicted file to see the markers as they sit on disk.'
              }
            />
          )}
          {view === 'history' && <HistoryView />}
          {view === 'stash' && <StashDetail />}
        </main>
        {view === 'review' && (
          <>
            <ResizeHandle
              side="next"
              range={TRAY_RANGE}
              label="Commit tray width"
              cssVar="--tray-w"
              width={trayWidth}
              onCommit={commitTrayWidth}
            />
            <aside className="commit-tray" aria-label="Commit tray">
              <CommitTray />
            </aside>
          </>
        )}
        {view === 'conflicts' && (
          <>
            <ResizeHandle
              side="next"
              range={TRAY_RANGE}
              label="Commit tray width"
              cssVar="--tray-w"
              width={trayWidth}
              onCommit={commitTrayWidth}
            />
            <aside className="commit-tray" aria-label="Conflict guidance">
              <ResolveHelp />
            </aside>
          </>
        )}
      </div>
      <StatusBar />
      <Toasts />
      <SettingsDialog />
      <CloneDialog />
      <RepoManagerDialog />
      <NewBranchDialog />
      <RenameBranchDialog />
      <AboutDialog />
      <ConfirmDialog />
    </div>
  )
}

/** The four-way switch under the command strip; arrow keys move between tabs. */
function SegmentedSwitch(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const tabsRef = useRef<HTMLDivElement | null>(null)
  // The active tab's box, measured from the DOM so the indicator follows the
  // real label widths (badges change them) instead of a guessed layout.
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null)

  const conflicts = state.status?.conflictCount ?? 0
  const files = state.status?.files.length ?? 0
  const stashes = state.stashes.length

  const measure = (): void => {
    const nav = tabsRef.current
    const active = nav?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (!nav || !active) {
      setIndicator(null)
      return
    }
    setIndicator({ x: active.offsetLeft, w: active.offsetWidth })
  }

  // Re-measure when the active tab changes and whenever a count badge appears
  // or disappears, since that changes the label's width.
  useLayoutEffect(() => {
    measure()
  }, [state.view, files, conflicts, stashes])

  useEffect(() => {
    const nav = tabsRef.current
    if (nav === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(nav)
    return () => observer.disconnect()
  }, [])

  /** Move the desk. The swap has one animation: the keyed pane fade. */
  const goTo = (next: DeskView): void => {
    store.setView(next)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const order = DESK_TABS.map(t => t.id)
    const at = order.indexOf(state.view)
    const next =
      order[
        (at + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length
      ]
    goTo(next)
    // Keep focus on the newly active tab when the switch itself has focus.
    const active = tabsRef.current?.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]'
    )
    if (document.activeElement instanceof HTMLButtonElement) active?.focus()
  }

  return (
    <nav className="desk-switch" ref={tabsRef} onKeyDown={onKeyDown} aria-label="Desk view">
      <span
        aria-hidden="true"
        className={`desk-indicator${indicator === null ? '' : ' shown'}`}
        style={
          {
            '--tab-x': `${indicator?.x ?? 0}px`,
            '--tab-w': `${indicator?.w ?? 0}px`
          } as CSSProperties
        }
      />
      {DESK_TABS.map(tab => {
        const active = state.view === tab.id
        const count =
          tab.id === 'review'
            ? files
            : tab.id === 'conflicts'
              ? conflicts
              : tab.id === 'stash'
                ? stashes
                : 0
        return (
          <button
            key={tab.id}
            id={`desk-tab-${tab.id}`}
            role="tab"
            aria-selected={active}
            aria-controls="desk-panel"
            tabIndex={active ? 0 : -1}
            className={`desk-tab${active ? ' active' : ''}${
              tab.id === 'conflicts' && count > 0 ? ' danger' : ''
            }`}
            onClick={() => goTo(tab.id)}
            title={
              tab.id === 'review'
                ? 'Review and commit your changes'
                : tab.id === 'history'
                  ? 'Browse the commit history'
                  : tab.id === 'conflicts'
                    ? conflicts > 0
                      ? `${conflicts} file${conflicts === 1 ? '' : 's'} waiting to be resolved`
                      : 'No conflicts right now'
                    : 'Restore previously stashed changes'
            }
          >
            {tab.label}
            {count > 0 && (
              <span className={`tab-badge${tab.id === 'conflicts' ? ' danger' : ''}`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

const BUSY_LABELS: Record<string, string> = {
  commit: 'Committing…',
  amend: 'Amending…',
  undo: 'Undoing commit…',
  revert: 'Reverting…',
  'cherry-pick': 'Cherry-picking…',
  clone: 'Cloning…',
  fetch: 'Fetching…',
  pull: 'Pulling…',
  push: 'Pushing…',
  stage: 'Staging…',
  unstage: 'Unstaging…',
  discard: 'Discarding changes…',
  resolve: 'Resolving conflict…',
  continue: 'Continuing operation…',
  abort: 'Aborting operation…',
  stash: 'Stashing changes…',
  'stash-apply': 'Applying stash…',
  'stash-pop': 'Popping stash…',
  'stash-drop': 'Dropping stash…',
  reveal: 'Revealing in Explorer…',
  open: 'Opening…',
  copy: 'Copying…',
  ignore: 'Updating .gitignore…',
  remote: 'Saving remote…',
  'delete-remote': 'Deleting remote branch…'
}

function busyLabel(busy: string): string {
  return BUSY_LABELS[busy] ?? `${busy}…`
}

function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function StatusBar(): JSX.Element | null {
  const state = useStoreState()
  const { status, selectedRepo } = state
  if (selectedRepo === null) return null
  const dirty = status?.files.length ?? 0
  const conflicts = status?.conflictCount ?? 0
  return (
    <footer className="status-bar">
      <span className="status-item" title={selectedRepo.path}>
        {selectedRepo.name}
      </span>
      <span className="status-item">
        {dirty === 0
          ? 'Clean'
          : `${dirty} changed file${dirty === 1 ? '' : 's'}`}
        {conflicts > 0 && ` · ${conflicts} conflicted`}
      </span>
      {state.stashes.length > 0 && (
        <span className="status-item" title="Stashed changes">
          {state.stashes.length} stashed
        </span>
      )}
      {state.busy !== null && (
        <span className="status-item busy">{busyLabel(state.busy)}</span>
      )}
      {state.aiBusy && (
        <span className="status-item busy ai">Writing commit message…</span>
      )}
      <span className="status-item right">
        {state.lastRefreshedAt !== null && (
          <span title="Last refreshed">updated {clockTime(state.lastRefreshedAt)} · </span>
        )}
        GitDesk
      </span>
    </footer>
  )
}
