import type { JSX, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ManagedRepository, RepoSummary } from '../../../shared/models'
import { call } from '../api'
import { useStore, useStoreState } from '../store'
import { relativeTime } from '../time'
import {
  ContextMenu,
  menuStateFromEvent,
  type ContextMenuItem,
  type ContextMenuState
} from './ContextMenu'
import { Dialog } from './Dialog'

/**
 * Manage repositories — the repository hub. Rows carry live git truth
 * (branch, changed files, ahead/behind, last commit) so the dialog is the
 * fastest way to pick the next repo, and doubles as the bulk workspace for
 * adding, removing, trashing and missing-folder cleanup.
 *
 * Selection is file-manager style (click, Ctrl/Shift click, arrows) with the
 * green selected surface; selected rows additionally expose a checkbox so
 * bulk intent stays countable at a glance. Destructive actions always route
 * through the store's shared confirm dialog.
 */
export function RepoManagerDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<ReadonlyMap<string, RepoSummary>>(
    new Map()
  )
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback((): void => store.setRepoManagerOpen(false), [store])

  useEffect(() => {
    if (!state.showRepoManager) return
    setFilter('')
    setSelected(new Set())
    setAnchorId(null)
    setCursorId(null)
    setMenu(null)
    setFetching(false)

    let cancelled = false
    const run = (): void => {
      const paths = state.repositories.filter(r => !r.missing).map(r => r.path)
      if (paths.length === 0) {
        setSummaries(new Map())
        setLoading(false)
        return
      }
      setLoading(true)
      void call('getRepoSummaries', paths)
        .then(entries => {
          if (!cancelled) {
            setSummaries(new Map(entries.map(e => [e.path, e.summary])))
          }
        })
        .catch(() => {
          if (!cancelled) setSummaries(new Map())
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    setSummaries(new Map())
    run()
    // Fill once on open and refresh when the window regains focus — no
    // polling; the hub is a snapshot, not a dashboard.
    window.addEventListener('focus', run)
    return () => {
      cancelled = true
      window.removeEventListener('focus', run)
    }
  }, [state.showRepoManager, state.repositories])

  if (!state.showRepoManager) return null

  const needle = filter.trim().toLowerCase()
  const rows = state.repositories.filter(
    r =>
      needle.length === 0 ||
      r.name.toLowerCase().includes(needle) ||
      r.path.toLowerCase().includes(needle)
  )
  const selectedRows = state.repositories.filter(r => selected.has(r.id))
  const selectedIds = [...selected]
  const missingRows = state.repositories.filter(r => r.missing)
  const allVisibleSelected =
    rows.length > 0 && rows.every(r => selected.has(r.id))
  const selNone = selectedRows.length === 0
  const selectedExisting = selectedRows.filter(r => !r.missing)
  const summaryOf = (repo: ManagedRepository): RepoSummary | null =>
    summaries.get(repo.path) ?? null

  const focusList = (): void => listRef.current?.focus()

  const toggleSelect = (id: string): void => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setAnchorId(id)
    setCursorId(id)
  }

  /** Range of visible rows between two ids, inclusive, in list order. */
  const rangeIds = (fromId: string, toId: string): string[] => {
    const a = rows.findIndex(r => r.id === fromId)
    const b = rows.findIndex(r => r.id === toId)
    if (a === -1 || b === -1) return [toId]
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    return rows.slice(lo, hi + 1).map(r => r.id)
  }

  const onRowClick = (e: ReactMouseEvent, row: ManagedRepository): void => {
    focusList()
    setCursorId(row.id)
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(row.id)
    } else if (e.shiftKey && anchorId !== null) {
      setSelected(new Set(rangeIds(anchorId, row.id)))
      setCursorId(row.id)
    } else {
      setSelected(new Set([row.id]))
      setAnchorId(row.id)
    }
  }

  const moveCursor = (delta: number, extend: boolean): void => {
    if (rows.length === 0) return
    const idx = cursorId === null ? -1 : rows.findIndex(r => r.id === cursorId)
    const nextIdx =
      idx === -1
        ? delta > 0
          ? 0
          : rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, idx + delta))
    const row = rows[nextIdx]
    if (row === undefined) return
    setCursorId(row.id)
    if (extend && anchorId !== null) {
      const base = selected.size > 0 ? [...selected] : []
      setSelected(new Set([...base, ...rangeIds(anchorId, row.id)]))
    } else {
      setAnchorId(row.id)
      setSelected(new Set([row.id]))
    }
  }

  const onKeyDown = (e: ReactKeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveCursor(1, e.shiftKey)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveCursor(-1, e.shiftKey)
        break
      case 'Enter': {
        e.preventDefault()
        const target =
          rows.find(r => r.id === cursorId) ??
          (selectedRows.length === 1 ? selectedRows[0] : undefined)
        if (target !== undefined) openRepo(target)
        break
      }
      case 'a':
      case 'A':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          setSelected(new Set(rows.map(r => r.id)))
        }
        break
      case 'Delete': {
        if (selectedRows.length > 0) {
          e.preventDefault()
          store.removeRepositories(selectedIds, false)
        }
        break
      }
      case 'Escape':
        if (menu !== null) setMenu(null)
        break
    }
  }

  const toggleAllVisible = (): void => {
    setSelected(prev => {
      if (rows.length > 0 && rows.every(r => prev.has(r.id))) {
        const next = new Set(prev)
        for (const r of rows) next.delete(r.id)
        return next
      }
      const next = new Set(prev)
      for (const r of rows) next.add(r.id)
      return next
    })
    setAnchorId(null)
    setCursorId(null)
  }

  const openRepo = (repo: ManagedRepository): void => {
    if (repo.missing) {
      store.toast(
        'error',
        `"${repo.name}" is missing from disk — fix the folder or remove it.`
      )
      return
    }
    void store.selectRepo(repo).then(() => close())
  }

  /** Rows an action targets: all of them when the clicked row is selected. */
  const rowsFor = (row: ManagedRepository): ManagedRepository[] => {
    const ids = selected.has(row.id) ? selectedIds : [row.id]
    return state.repositories.filter(r => ids.includes(r.id))
  }

  const revealRows = async (
    targets: ReadonlyArray<ManagedRepository>
  ): Promise<void> => {
    for (const r of targets.filter(x => !x.missing)) {
      try {
        await call('revealInFolder', r.path, '.')
      } catch (err) {
        store.toast('error', err instanceof Error ? err.message : String(err))
      }
    }
  }

  const viewRows = async (
    targets: ReadonlyArray<ManagedRepository>
  ): Promise<void> => {
    for (const r of targets.filter(x => !x.missing)) {
      try {
        await call('viewOnGitHub', r.path, { kind: 'repo' })
      } catch (err) {
        store.toast(
          'error',
          `${r.name}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }

  const fetchRows = async (
    targets: ReadonlyArray<ManagedRepository>
  ): Promise<void> => {
    const existing = targets.filter(x => !x.missing)
    if (existing.length === 0) {
      store.toast('error', 'The selected folders are already gone from disk.')
      return
    }
    setFetching(true)
    try {
      await store.fetchRepos(existing.map(r => r.path))
    } finally {
      setFetching(false)
    }
  }

  const rowMenu = (row: ManagedRepository): ContextMenuItem[] => {
    const targets = rowsFor(row)
    const multi = targets.length > 1
    return [
      {
        label: 'Open in GitDesk',
        onSelect: () => openRepo(row),
        disabled: row.missing
      },
      {
        label: multi ? `Open ${targets.length} in Explorer` : 'Open in Explorer',
        onSelect: () => void revealRows(targets)
      },
      {
        label: multi ? `Copy ${targets.length} paths` : 'Copy path',
        onSelect: () => void store.copyPaths(targets.map(r => r.path))
      },
      {
        label: 'View on GitHub',
        onSelect: () => void viewRows(targets)
      },
      {
        label: multi ? `Fetch ${targets.length}` : 'Fetch',
        onSelect: () => void fetchRows(targets)
      },
      {
        label: multi ? `Remove ${targets.length} from list` : 'Remove from list',
        onSelect: () => store.removeRepositories(targets.map(r => r.id), false),
        danger: true,
        separatorBefore: true
      },
      {
        label: multi
          ? `Move ${targets.length} folders to the Recycle Bin…`
          : 'Move folder to the Recycle Bin…',
        onSelect: () => store.removeRepositories(targets.map(r => r.id), true),
        danger: true
      }
    ]
  }

  return (
    <Dialog
      title="Manage repositories"
      width={720}
      maxWidth={720}
      onClose={close}
      footer={
        <>
          <span className="repo-manager-foot-hint">
            {missingRows.length > 0 ? (
              <button
                className="mini"
                title="Repositories whose folder no longer exists on disk"
                onClick={() =>
                  setSelected(prev => {
                    const next = new Set(prev)
                    for (const r of missingRows) next.add(r.id)
                    return next
                  })
                }
              >
                {missingRows.length} missing on disk — select
              </button>
            ) : (
              <span>
                Click to select · Ctrl/Shift-click for multiple · Enter opens ·
                Delete removes from the list
              </span>
            )}
          </span>
          <button className="btn" onClick={close}>
            Close
          </button>
        </>
      }
    >
      <div className="repo-manager-toolbar">
        <input
          className="popover-filter"
          placeholder="Filter repositories by name or path"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              focusList()
              moveCursor(1, false)
            }
          }}
          autoFocus
        />
        <button
          className="btn"
          disabled={fetching}
          onClick={() => void store.addRepositoriesBulk()}
          title="Add one or more git repository folders at once"
        >
          Add…
        </button>
        <button
          className="btn"
          disabled={fetching}
          onClick={() => store.setCloneOpen(true)}
        >
          Clone…
        </button>
      </div>

      <div
        className={`repo-manager-selectbar${selNone ? ' empty' : ''}`}
        aria-hidden={selNone}
      >
        <span className="repo-manager-count">{selected.size} selected</span>
        <button
          className="btn"
          disabled={selectedExisting.length === 0}
          onClick={() => {
            const first = selectedExisting[0]
            if (first !== undefined) openRepo(first)
          }}
        >
          Open{selectedExisting.length > 1 ? ` (${selectedExisting.length})` : ''}
        </button>
        <button
          className="btn"
          disabled={selectedExisting.length === 0}
          onClick={() => void revealRows(selectedRows)}
          title="Reveal the selected folders in Explorer"
        >
          Explorer
        </button>
        <button
          className="btn"
          disabled={selNone}
          onClick={() => void store.copyPaths(selectedRows.map(r => r.path))}
        >
          Copy paths
        </button>
        <button
          className="btn"
          disabled={selectedExisting.length === 0 || fetching}
          onClick={() => void fetchRows(selectedRows)}
          title="git fetch on each selected repository"
        >
          {fetching ? <span className="spinner" /> : null} Fetch
        </button>
        <span className="repo-manager-selectbar-spacer" />
        <button
          className="btn danger"
          disabled={selNone}
          onClick={() => store.removeRepositories(selectedIds, false)}
          title="Remove the selected repositories from GitDesk (folders stay on disk)"
        >
          Remove
        </button>
        <button
          className="btn danger"
          disabled={selNone || selectedExisting.length === 0}
          onClick={() => store.removeRepositories(selectedIds, true)}
          title={
            selectedExisting.length === 0 && !selNone
              ? 'The selected folders are already gone from disk'
              : 'Remove from GitDesk and move the whole folders to the Recycle Bin'
          }
        >
          Move to Recycle Bin…
        </button>
      </div>

      <div className="repo-manager-head">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={toggleAllVisible}
          disabled={rows.length === 0}
          title="Select all filtered repositories"
        />
        <span>
          {selected.size} of {state.repositories.length} selected
        </span>
        {loading && (
          <span className="repo-manager-loading">
            <span className="spinner" /> checking git state…
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="repo-manager-empty">
          {state.repositories.length === 0 ? (
            <>
              <p>No repositories yet.</p>
              <div className="onboarding-actions">
                <button
                  className="btn"
                  onClick={() => void store.addRepositoriesBulk()}
                >
                  Add repositories…
                </button>
                <button className="btn" onClick={() => store.setCloneOpen(true)}>
                  Clone repository…
                </button>
              </div>
            </>
          ) : (
            <p>No repositories match “{filter}”.</p>
          )}
        </div>
      ) : (
        <div
          className="repo-manager-list"
          role="listbox"
          aria-label="Repositories"
          aria-multiselectable="true"
          tabIndex={0}
          ref={listRef}
          onKeyDown={onKeyDown}
        >
          {rows.map(r => {
            const summary = summaryOf(r)
            const isSelected = selected.has(r.id)
            const isCurrent = state.selectedRepo?.id === r.id
            const pending = loading || summary === null
            const branchText = pending ? '—' : summary.branch ?? '—'
            const dirtyText = pending
              ? '—'
              : summary.dirty === 0
                ? 'clean'
                : `${summary.dirty} changed`
            const dirtyClass = pending
              ? 'repo-dirty'
              : summary.conflicts > 0
                ? 'repo-dirty conflicted'
                : summary.dirty === 0
                  ? 'repo-dirty clean'
                  : 'repo-dirty'
            const dirtyTitle = pending
              ? 'checking…'
              : summary.conflicts > 0
                ? `${summary.conflicts} conflicted`
                : 'changed files'
            const syncText = pending
              ? '—'
              : !summary.hasUpstream || (summary.ahead === 0 && summary.behind === 0)
                ? '—'
                : `↑${summary.ahead} ↓${summary.behind}`
            const syncIdle =
              pending ||
              summary === null ||
              !summary.hasUpstream ||
              (summary.ahead === 0 && summary.behind === 0)
            const syncTitle = pending
              ? 'checking…'
              : summary !== null && !summary.hasUpstream
                ? 'no upstream branch — push sets one on origin'
                : 'ahead / behind upstream'
            const lastText = pending
              ? '—'
              : summary.lastCommitAt === null
                ? 'no commits'
                : relativeTime(summary.lastCommitAt)
            return (
              <div
                key={r.id}
                role="option"
                aria-selected={isSelected}
                className={
                  `repo-manager-row${isSelected ? ' selected' : ''}` +
                  `${r.missing ? ' missing' : ''}` +
                  `${cursorId === r.id ? ' cursor' : ''}`
                }
                onClick={e => onRowClick(e, r)}
                onDoubleClick={() => openRepo(r)}
                onContextMenu={e => {
                  e.preventDefault()
                  setMenu(menuStateFromEvent(e, rowMenu(r)))
                }}
                title={r.missing ? `${r.path} (missing from disk)` : r.path}
              >
                <span className="repo-check-cell">
                  {isSelected && (
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggleSelect(r.id)}
                      onClick={e => e.stopPropagation()}
                      tabIndex={-1}
                      aria-label={`${r.name} selected`}
                    />
                  )}
                </span>
                <span className="repo-row-text">
                  <span className="repo-row-name">
                    <span className="repo-name-text">{r.name}</span>
                    {isCurrent && (
                      <span className="repo-badge repo-current-badge">open</span>
                    )}
                    {r.missing && (
                      <span className="repo-badge repo-missing-badge">missing</span>
                    )}
                    {summary?.unreadable === true && (
                      <span
                        className="repo-badge repo-unreadable-badge"
                        title="git status failed for this folder"
                      >
                        unreadable
                      </span>
                    )}
                  </span>
                  <span className="repo-row-path">{r.path}</span>
                </span>
                {!r.missing && (
                  <span className="repo-row-status">
                    <span className="repo-branch mono">{branchText}</span>
                    <span className={dirtyClass} title={dirtyTitle}>
                      {dirtyText}
                    </span>
                    <span
                      className={`repo-sync mono${syncIdle ? ' idle' : ''}`}
                      title={syncTitle}
                    >
                      {syncText}
                    </span>
                    <span className="repo-last">{lastText}</span>
                  </span>
                )}
                <button
                  className="row-open"
                  tabIndex={-1}
                  disabled={r.missing}
                  onClick={e => {
                    e.stopPropagation()
                    openRepo(r)
                  }}
                >
                  Open
                </button>
              </div>
            )
          })}
        </div>
      )}

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </Dialog>
  )
}
