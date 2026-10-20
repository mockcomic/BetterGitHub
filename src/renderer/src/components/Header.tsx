import type { JSX, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useStore, useStoreState } from '../store'

export function Header(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const [openMenu, setOpenMenu] = useState<'repo' | 'branch' | null>(null)
  const branchFilterRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (openMenu === 'branch') {
      branchFilterRef.current?.focus()
    }
  }, [openMenu])

  const { status } = state
  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0
  const hasUpstream = status?.upstream !== undefined

  return (
    <header className="header">
      <div className="header-left">
        <RepoButton
          open={openMenu === 'repo'}
          onToggle={() => setOpenMenu(openMenu === 'repo' ? null : 'repo')}
          onClose={() => setOpenMenu(null)}
        />
        {state.selectedRepo !== null && (
          <BranchButton
            filterRef={branchFilterRef}
            open={openMenu === 'branch'}
            onToggle={() => setOpenMenu(openMenu === 'branch' ? null : 'branch')}
            onClose={() => setOpenMenu(null)}
          />
        )}
      </div>

      {state.selectedRepo !== null && (
        <div className="header-right">
          <button
            className="btn"
            disabled={state.busy !== null || state.aiBusy}
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
            disabled={state.busy !== null}
            onClick={() => void store.doSync('fetch')}
            title="Fetch from origin"
          >
            Fetch
          </button>
          <button
            className="btn"
            disabled={state.busy !== null}
            onClick={() => void store.doSync('pull')}
            title="Pull from upstream"
          >
            ↓ Pull{behind > 0 ? ` ${behind}` : ''}
          </button>
          <button
            className="btn"
            disabled={state.busy !== null || status === null}
            onClick={() => void store.doSync('push')}
            title="Push to origin"
          >
            ↑ Push{ahead > 0 ? ` ${ahead}` : ''}
          </button>
          {!hasUpstream && status !== null && (
            <span className="hint" title="No upstream branch — Push will set one on origin">
              no upstream
            </span>
          )}
        </div>
      )}
    </header>
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
          {state.repositories.length === 0 ? (
            <div className="popover-empty">No repositories yet</div>
          ) : (
            state.repositories.map(r => (
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
          <div className="popover-sep" />
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
  const branches = state.branches.filter(b =>
    b.name.toLowerCase().includes(filter.toLowerCase())
  )

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
          {branches.length === 0 && (
            <div className="popover-empty">No matching branches</div>
          )}
          {branches.map(b => (
            <button
              key={b.name}
              className={`popover-item${b.current ? ' active' : ''}`}
              onClick={() => {
                onClose()
                if (!b.current) void store.checkoutBranch(b.name)
              }}
            >
              {b.current ? '✓ ' : ''}
              {b.name}
            </button>
          ))}
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
        </div>
      )}
    </div>
  )
}
