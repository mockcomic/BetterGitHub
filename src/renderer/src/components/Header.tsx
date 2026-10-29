import type { JSX, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useStore, useStoreState } from '../store'
import type { DeskView } from '../store'
import type { ExternalApp } from '../../../shared/models'
import { ConfettiBurst, useCelebration } from './Celebration'
import { BranchDivergence } from './BranchBadges'
import { useJustArmed } from '../motion'
import { syncVerb } from '../progressive'
import type { SyncVerb } from '../progressive'

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
  const repoFilterRef = useRef<HTMLInputElement | null>(null)
  const branchFilterRef = useRef<HTMLInputElement | null>(null)
  const deskFilterRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (openMenu === 'repo') {
      repoFilterRef.current?.focus()
    }
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

  const busy = state.busy

  return (
    <header className="header">
      <div className="header-left">
        <RepoButton
          filterRef={repoFilterRef}
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
          <SyncButton />
          <OverflowButton />
        </div>
      )}
    </header>
  )
}

/**
 * The strip's single sync verb. One button runs the verb git currently calls
 * for — catch up when behind, publish when ahead or unpublished, otherwise
 * look — and a caret next to it always offers all three by name, with their
 * accelerators. The context-aware label is GitHub Desktop's own pattern; the
 * caret keeps every verb a first-class click, so nothing is hidden, only
 * prioritised.
 */
function SyncButton(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const { status } = state
  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0
  const hasUpstream = status?.upstream !== undefined
  const busy = state.busy
  const { nonce: celebrateNonce, celebrating } = useCelebration('push')
  // The Push story still arms with a ring the moment git makes it true — a
  // commit landing elsewhere in the app turns ahead 0 → n and lights the verb.
  const pushEnabled =
    busy === null && status !== null && (ahead > 0 || !hasUpstream)
  const pushArmed = useJustArmed(pushEnabled)
  const verb = syncVerb(status)
  const verbClass = verb === 'pull' ? ' pull' : verb === 'push' ? ' push' : ''
  const armed = verb === 'push' && pushArmed ? ' arming' : ''

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (wrapRef.current !== null && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = (op: SyncVerb): void => {
    setOpen(false)
    void store.doSync(op)
  }

  const title =
    verb === 'pull'
      ? `The remote has ${behind} new commit${behind === 1 ? '' : 's'} — Pull brings them in (the ▾ menu also has Fetch and Push)`
      : verb === 'push'
        ? ahead > 0
          ? `Push ${ahead} commit${ahead === 1 ? '' : 's'} to ${status?.upstream ?? 'origin'}`
          : 'Publish this branch — the first push sets upstream on origin'
        : 'Check the remote for new work. Nothing on your machine changes.'

  const item = (op: SyncVerb, label: string, accel: string, enabled: boolean): JSX.Element => (
    <button
      className="popover-item"
      disabled={!enabled}
      title={`Run ${label.toLowerCase()} on its own`}
      onClick={() => run(op)}
    >
      {label}
      <span className="menu-accel">{accel}</span>
    </button>
  )

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <div className="sync-split">
        <button
          className={`btn sync${verbClass}${celebrating ? ' celebrating' : ''}${armed}`}
          disabled={busy !== null}
          onClick={() => run(verb)}
          title={title}
        >
          {busy === verb ? <span className="spinner" /> : null}
          {verb === 'pull' ? (
            <>
              ↓ Pull
              {behind > 0 && (
                <span className="count-pop" key={`sync-behind-${behind}`}>
                  {' '}{behind}
                </span>
              )}
            </>
          ) : verb === 'push' ? (
            <>
              ↑ Push
              {ahead > 0 && (
                <span className="count-pop" key={`sync-ahead-${ahead}`}>
                  {' '}{ahead}
                </span>
              )}
            </>
          ) : (
            <>Fetch origin</>
          )}
          {celebrating && <ConfettiBurst nonce={celebrateNonce} />}
        </button>
        <button
          className={`btn sync-caret${verbClass}`}
          disabled={busy !== null}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Sync options"
          title="Fetch, Pull or Push — pick one"
          onClick={() => setOpen(o => !o)}
        >
          <span className="caret">▾</span>
        </button>
      </div>
      {open && (
        <div className="popover strip-menu" role="menu">
          {item('fetch', 'Fetch', 'Ctrl+Shift+F', busy === null)}
          {item('pull', 'Pull', 'Ctrl+Shift+P', busy === null)}
          {item('push', 'Push', 'Ctrl+Shift+U', pushEnabled)}
        </div>
      )}
    </div>
  )
}

/**
 * The strip's overflow: everything that is not the everyday story. The
 * GitHub link (or the add-remote form on repos without an origin) and the
 * gateway out of the desk — the OS file manager plus every source editor
 * main actually detected on this machine (see src/main/external-apps.ts).
 * Detection is re-run whenever the menu opens, so installing an editor takes
 * effect without an app restart; results are swapped in as they arrive.
 */
function OverflowButton(): JSX.Element {
  const store = useStore()
  const state = useStoreState()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [addingRemote, setAddingRemote] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!open) return
    void store.refreshExternalApps(true)
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current !== null && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAddingRemote(false)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        setAddingRemote(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, store])

  // First paint of the menu before any probe ever ran: warm the list once so
  // the very first click already shows the cached machine inventory.
  useEffect(() => {
    void store.refreshExternalApps()
  }, [store])

  useEffect(() => {
    if (addingRemote) inputRef.current?.focus()
  }, [addingRemote])

  const managers: ReadonlyArray<ExternalApp> = state.externalApps.filter(a => a.kind === 'files')
  const editors: ReadonlyArray<ExternalApp> = state.externalApps.filter(a => a.kind === 'editor')
  const firstProbePending = state.externalApps.length === 0

  const closeAll = (): void => {
    setOpen(false)
    setAddingRemote(false)
  }

  const save = (): void => {
    if (url.trim().length > 0) void store.addRemote(url.trim())
    closeAll()
    setUrl('')
  }

  const openRow = (app: ExternalApp): JSX.Element => (
    <button
      key={app.id}
      className="popover-item"
      title={`Open this repository in ${app.label}`}
      onClick={() => {
        closeAll()
        void store.openInApp(app.id)
      }}
    >
      {app.label}
    </button>
  )

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        className="btn"
        disabled={state.busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        title="More — GitHub page, add remote, open in…"
        onClick={() => setOpen(o => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className="popover strip-menu" role="menu">
          {state.remoteUrl !== null ? (
            <button
              className="popover-item"
              title="Open this repository in the browser (Ctrl+Shift+G)"
              onClick={() => {
                closeAll()
                void store.viewOnGitHub({ kind: 'repo' })
              }}
            >
              View repository on GitHub
              <span className="menu-accel">Ctrl+Shift+G</span>
            </button>
          ) : state.status !== null ? (
            addingRemote ? (
              <div className="popover-form">
                <input
                  ref={inputRef}
                  className="popover-filter"
                  placeholder="Origin remote URL (https or ssh git URL)"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') save()
                    if (e.key === 'Escape') setAddingRemote(false)
                  }}
                />
                <div className="popover-item-row">
                  <button
                    className="btn"
                    disabled={url.trim().length === 0}
                    onClick={save}
                  >
                    Save remote
                  </button>
                  <span className="popover-item-actions">
                    <button className="mini" onClick={() => setAddingRemote(false)}>
                      Cancel
                    </button>
                  </span>
                </div>
              </div>
            ) : (
              <button
                className="popover-item"
                title="This repository has no origin remote yet — add one to push"
                onClick={() => setAddingRemote(true)}
              >
                Add remote…
              </button>
            )
          ) : null}
          <div className="popover-sep" />
          <div className="popover-heading">Open in</div>
          {firstProbePending ? (
            <div className="popover-empty">Checking this machine…</div>
          ) : (
            managers.map(openRow)
          )}
          {!firstProbePending && (
            <>
              <div className="popover-sep" />
              <div className="popover-heading">Editors</div>
              {editors.length === 0 ? (
                <div className="popover-empty">No supported editors detected</div>
              ) : (
                editors.map(openRow)
              )}
            </>
          )}
        </div>
      )}
    </div>
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
      : `This branch isn't on the remote yet — the first push publishes it`
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

function RepoButton({
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

  const visible = state.repositories.filter(r => !r.missing)
  const needle = filter.toLowerCase().trim()
  const matches =
    needle.length === 0
      ? visible
      : visible.filter(
          r =>
            r.name.toLowerCase().includes(needle) || r.path.toLowerCase().includes(needle)
        )

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
          <input
            ref={filterRef}
            className="popover-filter"
            placeholder="Filter repositories"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose()
            }}
          />
          {visible.length === 0 ? (
            <div className="popover-empty">No repositories yet</div>
          ) : matches.length === 0 ? (
            <div className="popover-empty">No matching repositories</div>
          ) : (
            matches.map(r => (
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
                <span className="branch-line">
                  {b.current ? '✓ ' : ''}
                  {b.name}
                  <BranchDivergence branch={b} current={branch} />
                </span>
              </button>
              {!b.current && (
                <span className="popover-item-actions">
                  <button
                    className="mini"
                    title={`Merge "${b.name}" into the current branch`}
                    onClick={() => {
                      onClose()
                      store.requestMergeBranch(b.name)
                    }}
                  >
                    Merge
                  </button>
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
                    <span className="branch-line">
                      {b.name}
                      <BranchDivergence branch={b} current={branch} />
                    </span>
                    <small className="popover-path">
                      {b.remote}/{b.name}
                    </small>
                  </button>
                  <span className="popover-item-actions">
                    <button
                      className="mini"
                      title={`Merge ${b.remote}/${b.name} into the current branch`}
                      onClick={() => {
                        onClose()
                        if (b.remote !== undefined)
                          store.requestMergeBranch(b.name, b.remote)
                      }}
                    >
                      Merge
                    </button>
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
          <button
            className="popover-item"
            onClick={() => {
              onClose()
              store.setMergeBranchOpen(true)
            }}
          >
            Merge branch into current branch…
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
