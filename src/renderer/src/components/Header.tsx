import type { JSX, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useStore, useStoreState } from '../store'
import type { DeskView } from '../store'
import type { ExternalApp, ManagedRepository } from '../../../shared/models'
import { ConfettiBurst, useCelebration } from './Celebration'
import {
  BranchDivergence,
  DivergenceChips,
  UpstreamGoneChip
} from './BranchBadges'
import { branchAriaLabel, commits, divergenceSentence } from '../divergence'
import { useJustArmed } from '../motion'
import { syncVerb } from '../progressive'
import type { SyncVerb } from '../progressive'

/** Placeholder for the command strip's filter, per desk view. */
const FILTER_LABELS: Record<DeskView, string> = {
  review: 'Filter files by path',
  history: 'Search commit messages',
  conflicts: 'Filter conflicted files',
  stash: 'Filter stashes',
  scripts: 'Filter scripts by name'
}

/**
 * The command strip: repository and branch pickers, the route readout
 * (branch ⇄ origin), the context filter, and sync controls — everything the
 * desk does is reachable from this row, with the repository-list verbs
 * (Clone, Add, Manage) in the overflow sub-menu.
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
 * for — catch up when behind, publish when ahead or unpublished, and when the
 * branch has diverged (or a push just bounced off a moved-ahead remote) the
 * compound Pull & Push, which lands the remote first and sends your work in
 * one click. Otherwise it just looks. A caret next to it always offers the
 * raw verbs by name, with their accelerators. The context-aware label is
 * GitHub Desktop's own pattern; the caret keeps every verb a first-class
 * click, so nothing is hidden, only prioritised.
 *
 * The label is the verb alone. The counts ride beside it as divergence chips
 * (↓ before ↑, `behind` in the Pull face's amber, `ahead` in the Push face's
 * green) — the desk's one way to write these numbers — and `aria-label` spells
 * the state in words so the chips need not be read aloud as arrows. A branch
 * whose upstream was deleted on the remote wears the `deleted` chip instead of
 * counts: git's `+0 -0` against a missing ref is not a branch in sync, and
 * Push is the only way back.
 */
function SyncButton(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const { status } = state
  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0
  const gone = status?.upstreamGone === true
  /**
   * A branch whose upstream was deleted on the remote still names one, but it
   * can be pulled from nothing and compared against nothing: for the desk's
   * purposes its work is unpushed. That is why the flag counts as "no
   * upstream" here — otherwise the verb correctly reads Push while the
   * enabled test, seeing an upstream, greys it out.
   */
  const hasUpstream = status?.upstream !== undefined && !gone
  const upstreamName = status?.upstream ?? 'origin'
  const busy = state.busy
  const { nonce: celebrateNonce, celebrating } = useCelebration('push')
  // The Push story still arms with a ring the moment git makes it true — a
  // commit landing elsewhere in the app turns ahead 0 → n and lights the verb.
  const pushEnabled =
    busy === null && status !== null && (ahead > 0 || !hasUpstream)
  const pushArmed = useJustArmed(pushEnabled)
  const needsPull = state.pushNeedsPull
  const verb = syncVerb(status, needsPull)
  const verbClass =
    verb === 'pull'
      ? ' pull'
      : verb === 'push'
        ? ' push'
        : verb === 'sync'
          ? ' sync-verb'
          : ''
  const armed = verb === 'push' && pushArmed ? ' arming' : ''
  // The compound verb runs as two raw ops in sequence, so its spinner follows
  // whichever half is in flight.
  const syncing = verb === 'sync' && (busy === 'pull' || busy === 'push')

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
    if (op === 'sync') void store.pullThenPush()
    else void store.doSync(op)
  }

  // The label names the verb and nothing else: the direction and the counts
  // belong to the chips, and the button's own face is already amber (incoming)
  // or green (outgoing). `↓ Pull ↓2` said the same thing three times.
  const label =
    verb === 'sync'
      ? 'Pull & Push'
      : verb === 'pull'
        ? 'Pull'
        : verb === 'push'
          ? ahead > 0 && !gone
            ? 'Push'
            : 'Publish'
          : 'Fetch origin'
  // The accessible name spells the whole state in words, which is what lets
  // the chips stay aria-hidden rather than being read as "down two up three".
  const spoken =
    verb === 'sync'
      ? `Pull & Push — ${divergenceSentence(ahead, behind)} against ${upstreamName}`
      : verb === 'pull'
        ? `Pull — ${commits(behind)} waiting on ${upstreamName}`
        : verb === 'push'
          ? gone
            ? `Publish ${status?.branch ?? 'this branch'} again — the upstream ${upstreamName} was deleted on the remote`
            : ahead > 0
              ? `Push — ${commits(ahead)} to ${upstreamName}`
              : `Publish — ${status?.branch ?? 'this branch'} is not on the remote yet`
            : 'Fetch origin — check the remote for new work'
  const title =
    verb === 'sync'
      ? needsPull
        ? 'The remote branch has commits you do not have — Pull lands first, then your Push follows automatically (the ▾ menu also has them on their own)'
        : `The remote has ${commits(behind)} new and you have ${ahead} to send — Pull lands first, then your Push follows automatically (the ▾ menu also has them on their own)`
      : verb === 'pull'
        ? `The remote has ${commits(behind)} new — Pull brings them in (the ▾ menu also has Fetch and Push)`
        : verb === 'push'
          ? gone
            ? `The remote branch this one tracked is gone — Pushing publishes ${status?.branch ?? 'the branch'} again and re-sets its upstream`
            : ahead > 0
              ? `Push ${commits(ahead)} to ${upstreamName}`
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
          aria-label={spoken}
          disabled={busy !== null}
          onClick={() => run(verb)}
          title={title}
        >
          {busy === verb || syncing ? <span className="spinner" /> : null}
          {label}
          {gone ? (
            <UpstreamGoneChip upstream={status?.upstream ?? ''} />
          ) : (
            <DivergenceChips ahead={ahead} behind={behind} />
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
        title="More — GitHub page, publish, clone, open in…"
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
              <>
                <button
                  className="popover-item"
                  title="Create a repository on your account and push this one into it"
                  onClick={() => {
                    closeAll()
                    store.openPublishDialog()
                  }}
                >
                  Publish repository…
                </button>
                <button
                  className="popover-item"
                  title="This repository has no origin remote yet — point it at an existing URL to push"
                  onClick={() => setAddingRemote(true)}
                >
                  Add remote URL…
                </button>
              </>
            )
          ) : null}
          <div className="popover-sep" />
          {/* Not a strip button: cloning is the repository list's verb, so it
              lives in a sub-menu next the other ways in, and a click always
              lands on the dialog instead of on a greyed control. */}
          <button
            className="popover-item"
            title="Clone another repository from a URL or from your account"
            onClick={() => {
              closeAll()
              store.setCloneOpen(true)
            }}
          >
            Clone repository…
          </button>
          <button
            className="popover-item"
            title="Dock or close the integrated terminal in this repository"
            onClick={() => {
              closeAll()
              store.toggleTerminal()
            }}
          >
            {state.terminalOpen ? 'Hide' : 'Show'} terminal
            <span className="menu-accel">Ctrl+`</span>
          </button>
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
 * The route this checkout travels — branch ⇄ remote, in the mono voice that
 * quotes the repository. It states the *route* and nothing else: the counts
 * belong to the verb beside them, which is the control they describe, and
 * saying them twice forty pixels apart in two formats and opposite orders only
 * gave the desk two things to read for one fact. What the readout keeps is the
 * pair of states the verb cannot speak — a branch not on the remote yet, and
 * an upstream deleted underneath it.
 */
function RouteReadout(): JSX.Element | null {
  const state = useStoreState()
  const status = state.status
  // A detached HEAD has no route to state, and an unpublished branch's
  // counts are zeroes against nothing — the Publish verb owns that story.
  if (status === null || status.detached) return null
  const upstreamRef = status.upstream
  if (upstreamRef === undefined) {
    const title = `This branch isn't on the remote yet — Push publishes it and sets its upstream`
    return (
      <span className="route-readout" title={title} aria-label={title}>
        <span className="route-branch">{status.branch}</span>
        <span className="route-arrow">⇄</span>
        <span>not published</span>
      </span>
    )
  }
  const remote = upstreamRef.split('/').filter(p => p.length > 0)[0] ?? upstreamRef
  const gone = status.upstreamGone === true
  const title = gone
    ? `Push and pull route: ${status.branch} ⇄ ${upstreamRef} — that upstream branch was deleted on the remote, so pushing republishes it`
    : `Push and pull route: ${status.branch} ⇄ ${upstreamRef}`
  return (
    <span className="route-readout" title={title} aria-label={title}>
      <span className="route-branch">{status.branch}</span>
      <span className="route-arrow">⇄</span>
      <span className="route-remote">{remote}</span>
      {gone && <UpstreamGoneChip upstream={upstreamRef} />}
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
  const popRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  /**
   * Keyboard cursor: an index into the filtered `matches`, held at -1 until an
   * arrow moves it, so opening the picker paints no ring until the keys ask for
   * one. Focus stays in the filter field the whole time (combobox pattern), so
   * typing and arrowing never fight.
   */
  const [cursor, setCursor] = useState(-1)
  /** Inline disclosure for the Add menu (add-local / clone / create) that
   *  sits beside the filter — collapsed whenever the picker itself closes. */
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setFilter('')
      setCursor(-1)
      setAddOpen(false)
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

  /** Move the cursor one row; an unset cursor starts at the near end. The ends
   *  clamp instead of wrapping, so overshooting a short list costs nothing. */
  const moveCursor = (delta: number): void => {
    if (matches.length === 0) return
    setCursor(prev =>
      prev === -1
        ? delta > 0
          ? 0
          : matches.length - 1
        : Math.min(matches.length - 1, Math.max(0, prev + delta))
    )
  }

  const jumpCursor = (toLast: boolean): void => {
    if (matches.length === 0) return
    setCursor(toLast ? matches.length - 1 : 0)
  }

  const pick = (repo: ManagedRepository): void => {
    onClose()
    void store.selectRepo(repo)
  }

  const cursorRepo = matches[cursor]
  const activeId = cursorRepo === undefined ? undefined : `repo-opt-${cursorRepo.id}`

  // The list scrolls inside the popover, so a cursor arrowed off the bottom (or
  // a filter that moves the row) has to be pulled back into view.
  useEffect(() => {
    if (!open || cursor < 0) return
    popRef.current
      ?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, cursor])

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        className="btn picker"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="picker-label">
          <small>Current repository</small>
          <strong>{state.selectedRepo?.name ?? 'Add repository'}</strong>
        </span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="popover" ref={popRef}>
          {/* Action rail at the very top: the repository verbs that are not
              part of the Add menu. Manage/Show/Remove sit above the filter so
              the list below stays the picker's one scrollable concern, and
              clone/create/add-local moved into the Add button beside it —
              GitHub Desktop's shape. */}
          <button
            className="popover-item"
            onClick={() => {
              onClose()
              store.setRepoManagerOpen(true)
            }}
          >
            Manage repositories…
          </button>
          {state.selectedRepo !== null && (
            <>
              <div className="popover-sep" />
              <button
                className="popover-item"
                onClick={() => {
                  onClose()
                  void store.revealFile('.')
                }}
              >
                Show in Explorer
              </button>
              <button
                className="popover-item danger"
                onClick={() => {
                  onClose()
                  store.removeRepository()
                }}
              >
                Remove this repository
              </button>
            </>
          )}
          <div className="popover-sep" />
          <div className="popover-filter-row">
            <input
              ref={filterRef}
              className="popover-filter"
              placeholder="Filter repositories"
              title="Type to filter · ↑↓ to move · Enter to open"
              value={filter}
              role="combobox"
              aria-expanded
              aria-controls="repo-picker-list"
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              onChange={e => {
                setFilter(e.target.value)
                // A new filter is a new list; an index kept from the old one would
                // point at an unrelated repository.
                setCursor(-1)
              }}
              onKeyDown={e => {
                switch (e.key) {
                  case 'ArrowDown':
                    e.preventDefault()
                    moveCursor(1)
                    break
                  case 'ArrowUp':
                    e.preventDefault()
                    moveCursor(-1)
                    break
                  case 'Home': {
                    // Home belongs to the text while the caret still has somewhere
                    // to go; once it is already home it takes the first row.
                    const el = e.currentTarget
                    if (el.selectionStart === 0 && el.selectionEnd === 0) {
                      e.preventDefault()
                      jumpCursor(false)
                    }
                    break
                  }
                  case 'End': {
                    const el = e.currentTarget
                    const at = el.value.length
                    if (el.selectionStart === at && el.selectionEnd === at) {
                      e.preventDefault()
                      jumpCursor(true)
                    }
                    break
                  }
                  case 'Enter': {
                    e.preventDefault()
                    // With no cursor yet, Enter takes the top match — the row the
                    // picker is already showing first.
                    const target = cursor === -1 ? matches[0] : matches[cursor]
                    if (target !== undefined) pick(target)
                    break
                  }
                  case 'Escape':
                    // The Add disclosure collapses before the picker closes, so
                    // one Escape never hides an open menu behind the popover.
                    if (addOpen) setAddOpen(false)
                    else onClose()
                    break
                }
              }}
            />
            <button
              className="btn popover-add"
              aria-haspopup="menu"
              aria-expanded={addOpen}
              title="Add a repository — clone, create, or point at one already on disk"
              onClick={() => setAddOpen(o => !o)}
              onKeyDown={e => {
                if (e.key === 'Escape') setAddOpen(false)
              }}
            >
              Add <span className="caret">▾</span>
            </button>
          </div>
          {addOpen && (
            <div className="repo-add-menu" role="menu" aria-label="Add a repository">
              <button
                className="popover-item"
                role="menuitem"
                title="Clone a repository from a URL"
                onClick={() => {
                  onClose()
                  store.setCloneOpen(true)
                }}
              >
                Clone repository…
              </button>
              <button
                className="popover-item"
                role="menuitem"
                title="Create a new repository on disk, optionally on your account"
                onClick={() => {
                  onClose()
                  store.setRepoDialog('new')
                }}
              >
                Create repository…
              </button>
              <button
                className="popover-item"
                role="menuitem"
                title="Point Aspen at a git folder that already exists on disk"
                onClick={() => {
                  onClose()
                  void store.addLocalRepository()
                }}
              >
                Add local repository…
              </button>
            </div>
          )}
          <div className="popover-sep" />
          <div id="repo-picker-list" role="listbox" aria-label="Repositories">
            {visible.length === 0 ? (
              <div className="popover-empty" role="presentation">
                No repositories yet
              </div>
            ) : matches.length === 0 ? (
              <div className="popover-empty" role="presentation">
                No matching repositories
              </div>
            ) : (
              matches.map((r, i) => (
                <button
                  key={r.id}
                  id={`repo-opt-${r.id}`}
                  role="option"
                  aria-selected={state.selectedRepo?.id === r.id}
                  data-row={i}
                  className={`popover-item${state.selectedRepo?.id === r.id ? ' active' : ''}${
                    i === cursor ? ' cursor' : ''
                  }`}
                  onClick={() => pick(r)}
                >
                  {r.name}
                  <small title={r.path} className="popover-path">
                    {r.path}
                  </small>
                </button>
              ))
            )}
          </div>
          {state.repositories.length > visible.length && (
            <div className="popover-empty">
              {state.repositories.length - visible.length} missing on disk —
              clean up in Manage repositories
            </div>
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
                aria-label={branchAriaLabel(b)}
                onClick={() => {
                  onClose()
                  if (!b.current) void store.checkoutBranch(b.name)
                }}
              >
                <span className="branch-line">
                  <span className="branch-name">
                    {b.current ? '✓ ' : ''}
                    {b.name}
                  </span>
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
                    aria-label={branchAriaLabel(b)}
                    title={`Create a local branch tracking ${b.remote}/${b.name}`}
                    onClick={() => {
                      onClose()
                      void store.checkoutBranch(b.name, b.remote)
                    }}
                  >
                    <span className="branch-line">
                      <span className="branch-name">{b.name}</span>
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
