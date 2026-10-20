import type { JSX, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useStore, useStoreState } from '../store'
import type { DeskView } from '../store'
import { ConfettiBurst, useCelebration } from './Celebration'

/** Placeholder for the command strip's filter, per desk view. */
const FILTER_LABELS: Record<DeskView, string> = {
  review: 'Filter files by path',
  history: 'Search commit messages',
  conflicts: 'Filter conflicted files',
  stash: 'Filter stashes'
}

/**
 * The command strip: repository and branch pickers, the route readout
 * (branch ⇄ origin with ahead/behind), the context filter, and sync
 * controls — everything the desk does is reachable from this row.
 */
export function Header(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const [openMenu, setOpenMenu] = useState<'repo' | 'branch' | null>(null)
  const [filterFocused, setFilterFocused] = useState(false)
  const branchFilterRef = useRef<HTMLInputElement | null>(null)
  const deskFilterRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (openMenu === 'branch') {
      branchFilterRef.current?.focus()
    }
  }, [openMenu])

  // Ctrl+K (Cmd+K on mac) focuses the strip's filter, per the surface brief.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (state.selectedRepo === null) return
        e.preventDefault()
        deskFilterRef.current?.focus()
        deskFilterRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.selectedRepo])

  const { status } = state
  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0
  const hasUpstream = status?.upstream !== undefined
  const busy = state.busy
  const { nonce: celebrateNonce, celebrating } = useCelebration('push')

  return (
    <header className="header">
      <div className="header-left">
        <RepoButton
          open={openMenu === 'repo'}
          onToggle={() => setOpenMenu(openMenu === 'repo' ? null : 'repo')}
          onClose={() => setOpenMenu(null)}
        />
        {state.selectedRepo !== null && (
          <>
            <BranchButton
              filterRef={branchFilterRef}
              open={openMenu === 'branch'}
              onToggle={() => setOpenMenu(openMenu === 'branch' ? null : 'branch')}
              onClose={() => setOpenMenu(null)}
            />
            <RouteReadout />
          </>
        )}
      </div>

      {state.selectedRepo !== null && (
        <div className="strip-center">
          <input
            ref={deskFilterRef}
            className="strip-filter"
            type="search"
            aria-label={FILTER_LABELS[state.view]}
            placeholder={FILTER_LABELS[state.view]}
            title="Focus with Ctrl+K · Esc clears"
            value={state.deskFilter}
            onChange={e => store.setDeskFilter(e.target.value)}
            onFocus={() => setFilterFocused(true)}
            onBlur={() => setFilterFocused(false)}
            onKeyDown={e => {
              if (e.key === 'Escape') store.setDeskFilter('')
            }}
          />
          {state.deskFilter.length === 0 && !filterFocused && (
            <span className="kbd-hint" aria-hidden="true">
              Ctrl K
            </span>
          )}
        </div>
      )}

      {state.selectedRepo !== null && (
        <div className="header-right">
          <button
            className="btn"
            disabled={busy !== null || state.aiBusy}
            onClick={() => {
              void store.refresh()
              void store.refreshBranches()
            }}
            title="Refresh status"
          >
            ⟳
          </button>
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() => void store.doSync('fetch')}
            title="Fetch from origin"
          >
            {busy === 'fetch' ? <span className="spinner" /> : null} Fetch
          </button>
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() => void store.doSync('pull')}
            title="Pull from upstream"
          >
            {busy === 'pull' ? <span className="spinner" /> : null} ↓ Pull
            {behind > 0 ? (
              <span className="count-pop" key={`pull-count-${behind}`}>
                {' '}{behind}
              </span>
            ) : (
              ''
            )}
          </button>
          <button
            className={`btn${celebrating ? ' celebrating' : ''}`}
            disabled={busy !== null || status === null}
            onClick={() => void store.doSync('push')}
            title="Push to origin"
          >
            {busy === 'push' ? <span className="spinner" /> : null} ↑ Push
            {ahead > 0 ? (
              <span className="count-pop" key={`push-count-${ahead}`}>
                {' '}{ahead}
              </span>
            ) : (
              ''
            )}
            {celebrating && <ConfettiBurst nonce={celebrateNonce} />}
          </button>
          {!hasUpstream && status !== null && (
            <span className="hint" title="No upstream branch — Push will set one on origin">
              no upstream
            </span>
          )}
          {state.remoteUrl === null && status !== null && (
            <AddRemoteButton disabled={busy !== null} />
          )}
          {state.remoteUrl !== null && (
            <button
              className="btn"
              disabled={busy !== null}
              title="Open this repository in the browser (Ctrl+Shift+G)"
              onClick={() => void store.viewOnGitHub({ kind: 'repo' })}
            >
              GitHub
            </button>
          )}
        </div>
      )}
    </header>
  )
}

/**
 * The route this checkout travels — branch ⇄ origin, one arrow-count per
 * direction, always in mono. It reports git truth only; when there is
 * nothing to say (0/0, upstream set) it stays quiet.
 */
function RouteReadout(): JSX.Element | null {
  const state = useStoreState()
  const status = state.status
  if (status === null) return null
  const upstream = status.upstream?.split('/').filter(p => p.length > 0)[0] ?? null
  const ahead = status.ahead
  const behind = status.behind
  if (upstream === null && ahead === 0 && behind === 0) return null
  const title =
    status.upstream !== undefined
      ? `Push and pull route: ${status.branch} ⇄ ${status.upstream}`
      : `No upstream branch yet — the first push sets one on origin`
  return (
    <span className="route-readout" title={title} aria-label={title}>
      {status.branch} <span className="route-arrow">⇄</span>{' '}
      {upstream ?? 'no remote'}
      {ahead > 0 && (
        <>
          {' · ↑'}
          <span className="count-pop" key={`route-ahead-${ahead}`}>
            {ahead}
          </span>
        </>
      )}
      {behind > 0 && (
        <>
          {' · ↓'}
          <span className="count-pop" key={`route-behind-${behind}`}>
            {behind}
          </span>
        </>
      )}
    </span>
  )
}

/**
 * In-world replacement for the old native prompt: a small popover form on
 * the strip itself, styled like the rest of the desk.
 */
function AddRemoteButton({ disabled }: { disabled: boolean }): JSX.Element {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const handler = (e: MouseEvent) => {
      if (wrapRef.current !== null && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const save = (): void => {
    if (url.trim().length > 0) void store.addRemote(url.trim())
    setOpen(false)
    setUrl('')
  }

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        className="btn"
        disabled={disabled}
        title="This repository has no origin remote — add one to push"
        onClick={() => setOpen(o => !o)}
      >
        Add remote…
      </button>
      {open && (
        <div className="popover">
          <input
            ref={inputRef}
            className="popover-filter"
            placeholder="Origin remote URL (https or ssh git URL)"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setOpen(false)
            }}
          />
          <div className="popover-sep" />
          <div className="popover-item-row">
            <button
              className="btn"
              disabled={url.trim().length === 0}
              onClick={save}
            >
              Save remote
            </button>
            <span className="popover-item-actions">
              <button className="mini" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function RepoButton({
  open,
  onToggle,
  onClose
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
}): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current !== null && !wrapRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  const visible = state.repositories.filter(r => !r.missing)

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button className="btn picker" onClick={onToggle}>
        <span className="picker-label">
          <small>Current repository</small>
          <strong>{state.selectedRepo?.name ?? 'Add repository'}</strong>
        </span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="popover">
          {visible.length === 0 ? (
            <div className="popover-empty">No repositories yet</div>
          ) : (
            visible.map(r => (
              <button
                key={r.id}
                className={`popover-item${state.selectedRepo?.id === r.id ? ' active' : ''}`}
                onClick={() => {
                  onClose()
                  void store.selectRepo(r)
                }}
              >
                {r.name}
                <small title={r.path} className="popover-path">
                  {r.path}
                </small>
              </button>
            ))
          )}
          {state.repositories.length > visible.length && (
            <div className="popover-empty">
              {state.repositories.length - visible.length} missing on disk —
              clean up in Manage repositories
            </div>
          )}
          <div className="popover-sep" />
          <button
            className="popover-item"
            onClick={() => {
              onClose()
              store.setRepoManagerOpen(true)
            }}
          >
            Manage repositories…
          </button>
          <button
            className="popover-item"
            onClick={() => {
              onClose()
              void store.addLocalRepository()
            }}
          >
            Add local repository…
          </button>
          <button
            className="popover-item"
            onClick={() => {
              onClose()
              store.setCloneOpen(true)
            }}
          >
            Clone repository…
          </button>
          {state.selectedRepo !== null && (
            <button
              className="popover-item"
              onClick={() => {
                onClose()
                void store.revealFile('.')
              }}
            >
              Show in Explorer
            </button>
          )}
          {state.selectedRepo !== null && (
            <button
              className="popover-item danger"
              onClick={() => {
                onClose()
                store.removeRepository()
              }}
            >
              Remove this repository
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function BranchButton({
  open,
  onToggle,
  onClose,
  filterRef
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  filterRef: RefObject<HTMLInputElement | null>
}): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!open) {
      setFilter('')
      return
    }
    const handler = (e: MouseEvent) => {
      if (wrapRef.current !== null && !wrapRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  const branch = state.status?.branch ?? '(unknown)'
  const needle = filter.toLowerCase()
  const locals = state.branches.filter(b => b.name.toLowerCase().includes(needle))
  const remotes = state.remoteBranches.filter(b => b.name.toLowerCase().includes(needle))
  const nothingFound = locals.length === 0 && remotes.length === 0

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button className="btn picker" onClick={onToggle}>
        <span className="picker-label">
          <small>Current branch</small>
          <strong>{branch}</strong>
        </span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="popover">
          <input
            ref={filterRef}
            className="popover-filter"
            placeholder="Filter branches"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          {state.branchesError !== null && (
            <div className="popover-empty">{state.branchesError}</div>
          )}
          {nothingFound && state.branchesError === null && (
            <div className="popover-empty">No matching branches</div>
          )}
          {locals.map(b => (
            <div key={`local-${b.name}`} className="popover-item-row">
              <button
                className={`popover-item${b.current ? ' active' : ''}`}
                onClick={() => {
                  onClose()
                  if (!b.current) void store.checkoutBranch(b.name)
                }}
              >
                {b.current ? '✓ ' : ''}
                {b.name}
              </button>
              {!b.current && (
                <span className="popover-item-actions">
                  <button
                    className="mini"
                    title="Rename this branch"
                    onClick={() => {
                      onClose()
                      store.setRenameBranchTarget(b.name)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="mini danger"
                    title="Delete this branch"
                    onClick={() => {
                      onClose()
                      store.deleteBranch(b.name)
                    }}
                  >
                    Delete
                  </button>
                </span>
              )}
            </div>
          ))}
          {remotes.length > 0 && (
            <>
              <div className="popover-sep" />
              <div className="popover-heading">Remote branches</div>
              {remotes.map(b => (
                <div key={`remote-${b.remote}-${b.name}`} className="popover-item-row">
                  <button
                    className="popover-item"
                    title={`Create a local branch tracking ${b.remote}/${b.name}`}
                    onClick={() => {
                      onClose()
                      void store.checkoutBranch(b.name, b.remote)
                    }}
                  >
                    {b.name}
                    <small className="popover-path">
                      {b.remote}/{b.name}
                    </small>
                  </button>
                  <span className="popover-item-actions">
                    <button
                      className="mini danger"
                      title={`Delete ${b.remote}/${b.name} on the remote`}
                      onClick={() => {
                        onClose()
                        if (b.remote !== undefined)
                          void store.deleteRemoteBranch(b.remote, b.name)
                      }}
                    >
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </>
          )}
          <div className="popover-sep" />
          <button
            className="popover-item"
            onClick={() => {
              onClose()
              store.setNewBranchOpen(true)
            }}
          >
            New branch…
          </button>
          <button
            className="popover-item"
            onClick={() => {
              onClose()
              store.setRenameBranchTarget(state.status?.branch ?? null)
            }}
          >
            Rename current branch…
          </button>
          {state.remoteUrl !== null && (
            <button
              className="popover-item"
              onClick={() => {
                onClose()
                void store.viewOnGitHub({ kind: 'branch', branch })
              }}
            >
              View branch on GitHub
            </button>
          )}
        </div>
      )}
    </div>
  )
}
