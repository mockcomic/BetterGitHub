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
 * Layout is one command rail per concern: the filter rail always, a bulk
 * action rail that exists only while a selection exists, and a sticky column
 * header that labels — and sorts — the git-truth columns. Folders that fell
 * off the disk are grouped under their own heading so cleanup never hides
 * behind the healthy rows.
 *
 * Selection is file-manager style (click, Ctrl/Shift click, arrows) with the
 * green selected surface and a checkbox in every row. Opening is a
 * single-repository verb: the bulk button always names what it will open.
 * Destructive actions always route through the store's shared confirm dialog.
 */

/** Sortable columns; `null` sort keeps the order repositories were added in. */
type SortKey = 'name' | 'branch' | 'changes' | 'sync' | 'last'
interface SortState {
  readonly key: SortKey
  readonly dir: 'asc' | 'desc'
}

const COLUMNS: ReadonlyArray<{ key: SortKey; label: string; title: string; right: boolean }> = [
  { key: 'name', label: 'Repository', title: 'Sort by name', right: false },
  { key: 'branch', label: 'Branch', title: 'Sort by checked-out branch', right: true },
  { key: 'changes', label: 'Changes', title: 'Sort by changed files', right: true },
  { key: 'sync', label: 'Sync', title: 'Sort by distance from upstream', right: true },
  { key: 'last', label: 'Last commit', title: 'Sort by most recent commit', right: true }
]

export function RepoManagerDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)
  const [summaries, setSummaries] = useState<ReadonlyMap<string, RepoSummary>>(
    new Map()
  )
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const filterRef = useRef<HTMLInputElement | null>(null)

  const close = useCallback((): void => store.setRepoManagerOpen(false), [store])

  useEffect(() => {
    if (!state.showRepoManager) return
    setFilter('')
    setSelected(new Set())
    setAnchorId(null)
    setCursorId(null)
    setSort(null)
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
  const matchesFilter = (r: ManagedRepository): boolean =>
    needle.length === 0 ||
    r.name.toLowerCase().includes(needle) ||
    r.path.toLowerCase().includes(needle)

  const summaryOf = (repo: ManagedRepository): RepoSummary | null =>
    summaries.get(repo.path) ?? null

  /** Sort term for a row; null means "no git truth" and always sinks. */
  const sortValue = (
    repo: ManagedRepository,
    key: SortKey
  ): string | number | null => {
    const s = summaryOf(repo)
    if (key === 'name') return repo.name.toLowerCase()
    if (repo.missing || s === null || s.unreadable) return null
    switch (key) {
      case 'branch':
        return (s.branch ?? '').toLowerCase()
      case 'changes':
        return s.conflicts * 100_000 + s.dirty
      case 'sync':
        return s.hasUpstream ? s.ahead + s.behind : null
      case 'last':
        return s.lastCommitAt === null ? null : Date.parse(s.lastCommitAt)
    }
  }

  const compareRows = (a: ManagedRepository, b: ManagedRepository): number => {
    if (sort === null) return 0
    const va = sortValue(a, sort.key)
    const vb = sortValue(b, sort.key)
    // Rows without git truth sink in both directions: sorting is for
    // comparing real state, not for hiding what could not be read.
    if (va === null && vb === null) return a.name.localeCompare(b.name)
    if (va === null) return 1
    if (vb === null) return -1
    const base = va < vb ? -1 : va > vb ? 1 : 0
    if (base !== 0) return sort.dir === 'asc' ? base : -base
    return a.name.localeCompare(b.name)
  }

  const cycleSort = (key: SortKey): void => {
    setSort(prev => {
      if (prev === null || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  const visible = state.repositories.filter(matchesFilter)
  const shownRows = visible
    .filter(r => !r.missing)
    .sort(compareRows)
  const missingRows = visible
    .filter(r => r.missing)
    .sort(compareRows)
  /** Navigation order — what the arrows, ranges and Select-all act on. */
  const rows: ReadonlyArray<ManagedRepository> = [...shownRows, ...missingRows]

  const selectedRows = state.repositories.filter(r => selected.has(r.id))
  const selectedIds = [...selected]
  const selNone = selectedRows.length === 0
  const selectedExisting = selectedRows.filter(r => !r.missing)
  const allVisibleSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  /** Which repo the bulk Open verb will take: the focused one when possible. */
  const openTarget =
    selectedExisting.find(r => r.id === cursorId) ?? selectedExisting[0]
  const filtering = needle.length > 0

  const focusList = (): void => listRef.current?.focus()
  const focusFilter = (): void => filterRef.current?.focus()

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
    if (delta < 0 && idx === 0) {
      // Up at the top of the list returns to the filter, file-manager style.
      setCursorId(null)
      focusFilter()
      return
    }
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

  const jumpCursor = (toLast: boolean): void => {
    const row = toLast ? rows[rows.length - 1] : rows[0]
    if (row === undefined) return
    setCursorId(row.id)
    setAnchorId(row.id)
    setSelected(new Set([row.id]))
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
      case 'Home':
        e.preventDefault()
        jumpCursor(false)
        break
      case 'End':
        e.preventDefault()
        jumpCursor(true)
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

  const allMissingIds = state.repositories
    .filter(r => r.missing)
    .map(r => r.id)

  return (
    <Dialog
      title="Manage repositories"
      width={720}
      maxWidth={720}
      onClose={close}
      footer={
        <>
          <span className="repo-manager-foot-hint">
            <code>Ctrl</code>/<code>Shift</code>-click · <code>Enter</code> opens ·{' '}
            <code>Delete</code> removes from the list
          </span>
          <button
            className="btn"
            disabled={selNone}
            onClick={() => store.removeRepositories(selectedIds, false)}
            title="Remove the selected repositories from GitDesk — the folders stay on disk. Delete does the same."
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
          <button className="btn" onClick={close}>
            Close
          </button>
        </>
      }
    >
      <div className="repo-manager-toolbar">
        <span className="repo-manager-filter-wrap">
          <input
            className={`repo-manager-filter${filtering ? ' has-shown' : ''}`}
            ref={filterRef}
            placeholder="Filter repositories by name or path"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                focusList()
                moveCursor(1, false)
              } else if (e.key === 'Escape' && filter.length > 0) {
                // Clear the filter first; a second Escape closes the dialog.
                e.stopPropagation()
                setFilter('')
              }
            }}
            autoFocus
          />
          {filtering && (
            <span className="repo-manager-shown">
              {rows.length} of {state.repositories.length} shown
            </span>
          )}
        </span>
        {loading && (
          <span className="repo-manager-busy">
            <span className="spinner" /> checking git state…
          </span>
        )}
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
          title="Clone a repository from a URL"
        >
          Clone…
        </button>
      </div>

      {!selNone && (
        <div className="repo-manager-selectbar">
          <span className="repo-manager-count" aria-live="polite">
            {selected.size} selected
          </span>
          <button
            className="btn"
            disabled={openTarget === undefined}
            onClick={() => {
              if (openTarget !== undefined) openRepo(openTarget)
            }}
            title={
              openTarget === undefined
                ? 'Select a repository whose folder is on disk'
                : `Open “${openTarget.name}” — GitDesk works in one repository at a time`
            }
          >
            Open
            {selectedExisting.length > 1 && openTarget !== undefined && (
              <span className="btn-target">{openTarget.name}</span>
            )}
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
            title="Copy the selected folders' paths to the clipboard"
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
        </div>
      )}

      <div
        className="repo-table"
        role="grid"
        aria-label="Repositories"
        aria-multiselectable="true"
        aria-activedescendant={cursorId === null ? undefined : `repo-row-${cursorId}`}
        tabIndex={0}
        ref={listRef}
        onKeyDown={onKeyDown}
      >
        <div className="repo-table-head" role="row">
          <span className="repo-check-cell" role="columnheader">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={rows.length === 0}
              aria-label="Select all shown repositories"
              title="Select all shown repositories"
            />
          </span>
          {COLUMNS.map(col => (
            <span
              key={col.key}
              role="columnheader"
              className={col.right ? 'head-right' : undefined}
              aria-sort={
                sort?.key === col.key
                  ? sort.dir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <button
                className={`repo-sort${col.right ? ' right' : ''}`}
                onClick={() => cycleSort(col.key)}
                title={
                  sort?.key === col.key
                    ? `${col.title} — click to change the order`
                    : col.title
                }
              >
                {col.label}
                {sort?.key === col.key && (
                  <span className="caret">{sort.dir === 'asc' ? '▴' : '▾'}</span>
                )}
              </button>
            </span>
          ))}
          <span role="columnheader" className="repo-head-action" />
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
              <>
                <p>No repositories match “{filter.trim()}”.</p>
                <button
                  className="mini"
                  onClick={() => {
                    setFilter('')
                    focusFilter()
                  }}
                >
                  Clear filter
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {shownRows.map(r => (
              <RepoRow
                key={r.id}
                repo={r}
                summary={summaryOf(r)}
                loading={loading}
                isSelected={selected.has(r.id)}
                isCursor={cursorId === r.id}
                isCurrent={state.selectedRepo?.id === r.id}
                onClick={onRowClick}
                onOpen={openRepo}
                onToggle={toggleSelect}
                onMenu={(e, items) => setMenu(menuStateFromEvent(e, items))}
                menuFor={rowMenu}
              />
            ))}
            {missingRows.length > 0 && (
              <div className="repo-group-row" role="row">
                <span className="repo-group-cell" role="gridcell" aria-colspan={7}>
                  <span className="repo-group-label">
                    Missing from disk · {missingRows.length}
                  </span>
                  <button
                    className="mini"
                    title="Remove every missing entry from GitDesk (nothing left on disk to lose)"
                    onClick={() => store.removeRepositories(allMissingIds, false)}
                  >
                    Remove all from list
                  </button>
                </span>
              </div>
            )}
            {missingRows.map(r => (
              <RepoRow
                key={r.id}
                repo={r}
                summary={summaryOf(r)}
                loading={loading}
                isSelected={selected.has(r.id)}
                isCursor={cursorId === r.id}
                isCurrent={state.selectedRepo?.id === r.id}
                onClick={onRowClick}
                onOpen={openRepo}
                onToggle={toggleSelect}
                onMenu={(e, items) => setMenu(menuStateFromEvent(e, items))}
                menuFor={rowMenu}
              />
            ))}
          </>
        )}
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </Dialog>
  )
}

/** One repository row: identity on the left, git truth in labelled columns. */
function RepoRow({
  repo,
  summary,
  loading,
  isSelected,
  isCursor,
  isCurrent,
  onClick,
  onOpen,
  onToggle,
  onMenu,
  menuFor
}: {
  repo: ManagedRepository
  summary: RepoSummary | null
  loading: boolean
  isSelected: boolean
  isCursor: boolean
  isCurrent: boolean
  onClick: (e: ReactMouseEvent, repo: ManagedRepository) => void
  onOpen: (repo: ManagedRepository) => void
  onToggle: (id: string) => void
  onMenu: (
    e: ReactMouseEvent,
    items: ReadonlyArray<ContextMenuItem>
  ) => void
  menuFor: (repo: ManagedRepository) => ContextMenuItem[]
}): JSX.Element {
  // A row has nothing to say until git answers for it, and an unreadable
  // folder reports no counts at all — never a false "clean".
  const pending = loading || summary === null
  const unavailable = pending || summary.unreadable
  const branchText = unavailable ? '—' : summary.branch ?? '—'
  const dirtyText = unavailable
    ? '—'
    : summary.dirty === 0
      ? 'clean'
      : `${summary.dirty} changed`
  const dirtyClass = unavailable
    ? 'repo-cell repo-dirty'
    : summary.conflicts > 0
      ? 'repo-cell repo-dirty conflicted'
      : summary.dirty === 0
        ? 'repo-cell repo-dirty clean'
        : 'repo-cell repo-dirty modified'
  const dirtyTitle = unavailable
    ? summary?.unreadable === true
      ? 'git status failed for this folder'
      : 'checking…'
    : summary.conflicts > 0
      ? `${summary.conflicts} conflicted of ${summary.dirty} changed`
      : 'changed files'
  const syncText = unavailable
    ? '—'
    : !summary.hasUpstream || (summary.ahead === 0 && summary.behind === 0)
      ? '—'
      : `↑${summary.ahead} ↓${summary.behind}`
  const syncIdle =
    unavailable || !summary.hasUpstream || (summary.ahead === 0 && summary.behind === 0)
  const syncTitle = unavailable
    ? summary?.unreadable === true
      ? 'git status failed for this folder'
      : 'checking…'
    : summary !== null && !summary.hasUpstream
      ? 'no upstream branch — push sets one on origin'
      : 'ahead / behind upstream'
  const lastText = unavailable
    ? '—'
    : summary.lastCommitAt === null
      ? 'no commits'
      : relativeTime(summary.lastCommitAt)
  const { dir, leaf } = pathParts(repo.path)

  return (
    <div
      id={`repo-row-${repo.id}`}
      role="row"
      aria-selected={isSelected}
      className={
        `repo-manager-row${isSelected ? ' selected' : ''}` +
        `${repo.missing ? ' missing' : ''}` +
        `${isCursor ? ' cursor' : ''}`
      }
      onClick={e => onClick(e, repo)}
      onDoubleClick={() => onOpen(repo)}
      onContextMenu={e => {
        e.preventDefault()
        onMenu(e, menuFor(repo))
      }}
      title={
        repo.missing ? `${repo.path} (missing from disk)` : repo.path
      }
    >
      <span className="repo-check-cell" role="gridcell">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(repo.id)}
          onClick={e => e.stopPropagation()}
          tabIndex={-1}
          aria-label={`Select ${repo.name}`}
        />
      </span>
      <span className="repo-row-text" role="gridcell">
        <span className="repo-row-name">
          <span className="repo-name-text">{repo.name}</span>
          {isCurrent && <span className="repo-badge repo-current-badge">open</span>}
          {summary?.unreadable === true && (
            <span
              className="repo-badge repo-unreadable-badge"
              title="git status failed for this folder"
            >
              unreadable
            </span>
          )}
        </span>
        <span className="repo-row-path">
          <span className="repo-path-dir">{dir}</span>
          <span className="repo-path-leaf">{leaf}</span>
        </span>
      </span>
      {repo.missing ? (
        <span className="repo-none" role="gridcell" aria-colspan={5}>
          not on disk
        </span>
      ) : (
        <>
          <span className="repo-cell repo-branch mono" role="gridcell">
            {branchText}
          </span>
          <span className={dirtyClass} role="gridcell" title={dirtyTitle}>
            {dirtyText}
          </span>
          <span
            className={`repo-cell repo-sync mono${syncIdle ? ' idle' : ''}`}
            role="gridcell"
            title={syncTitle}
          >
            {syncText}
          </span>
          <span className="repo-cell repo-last" role="gridcell">
            {lastText}
          </span>
          <span className="repo-cell-action" role="gridcell">
            <button
              className="row-open"
              tabIndex={-1}
              disabled={repo.missing}
              onClick={e => {
                e.stopPropagation()
                onOpen(repo)
              }}
              title={`Open “${repo.name}” in GitDesk`}
            >
              Open
            </button>
          </span>
        </>
      )}
    </div>
  )
}

/** Split a path into the parent directory (truncates) and folder name (stays). */
function pathParts(path: string): { dir: string; leaf: string } {
  const trimmed = path.replace(/[\\/]+$/, '')
  const leaf = trimmed.split(/[\\/]/).pop() ?? trimmed
  return { leaf, dir: trimmed.slice(0, trimmed.length - leaf.length) }
}
