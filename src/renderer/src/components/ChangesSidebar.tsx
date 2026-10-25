import type { JSX } from 'react'
import { useState } from 'react'
import type { FileStatus, IgnoreRequest } from '../../../shared/models'
import { useStore, useStoreState, type AppState } from '../store'
import { relativeTime } from '../time'
import {
  ContextMenu,
  menuStateFromEvent,
  type ContextMenuItem,
  type ContextMenuState
} from './ContextMenu'
import { ConfettiBurst, useCelebration } from './Celebration'

function matches(path: string, filter: string): boolean {
  const needle = filter.trim().toLowerCase()
  return needle.length === 0 || path.toLowerCase().includes(needle)
}

/** Case-insensitive path filter for the review queue, incl. rename sources. */
function fileMatches(file: FileStatus, filter: string): boolean {
  return (
    matches(file.path, filter) ||
    (file.oldPath !== undefined && matches(file.oldPath, filter))
  )
}

// ------------------------------------------------------------- ignore menu

interface PathParts {
  /** Repo-relative parent dir without trailing slash; '' at the root. */
  readonly dir: string
  readonly name: string
  /** Extension glob body, or null for dot-files / extension-less names. */
  readonly ext: string | null
}

function pathParts(path: string): PathParts {
  const cut = path.lastIndexOf('/')
  const dir = cut === -1 ? '' : path.slice(0, cut)
  const name = path.slice(cut + 1)
  const dot = name.lastIndexOf('.')
  const ext = dot <= 0 || dot === name.length - 1 ? null : name.slice(dot + 1)
  return { dir, name, ext }
}

/**
 * GitHub Desktop's ignore actions, deepened: exact file, name or extension
 * anywhere, the containing/root folder (whole subtree or direct contents
 * only), and the extension scoped to the folder at a bounded depth.
 */
function ignoreSubmenu(
  file: FileStatus,
  store: ReturnType<typeof useStore>,
  hasUntracked: boolean
): ContextMenuItem[] {
  const { dir, name, ext } = pathParts(file.path)
  const items: ContextMenuItem[] = [
    {
      label: 'This file',
      title: `Append \`${file.path}\` to .gitignore`,
      onSelect: () => void store.ignoreFile(file.path, { mode: 'file' })
    },
    {
      label: `“${name}” at any depth`,
      title: `Append \`${name}\` to .gitignore (matches in every folder)`,
      onSelect: () => void store.ignoreFile(file.path, { mode: 'name' })
    }
  ]
  const ignore = (request: IgnoreRequest): (() => void) => (): void =>
    void store.ignoreFile(file.path, request)
  if (ext !== null) {
    items.push({
      label: `Extension “*.${ext}” anywhere`,
      title: `Append \`*.${ext}\` to .gitignore (matches in every folder)`,
      onSelect: ignore({ mode: 'extension' })
    })
  }
  if (dir.length > 0) {
    items.push(
      { label: '', separator: true },
      {
        label: `Folder “${dir}/” (everything inside)`,
        title: `Append \`${dir}/\` to .gitignore`,
        onSelect: ignore({ mode: 'folder' })
      },
      {
        label: 'Only its direct contents',
        title: `Append \`${dir}/*\` to .gitignore (subfolders themselves match too, so git stops descending into them)`,
        onSelect: ignore({ mode: 'folderDirect' })
      }
    )
    const firstSeg = dir.split('/')[0]
    if (dir.includes('/')) {
      items.push({
        label: `Root folder “${firstSeg}/”`,
        title: `Append \`${firstSeg}/\` to .gitignore (the whole top-level tree)`,
        onSelect: ignore({ mode: 'rootFolder' })
      })
    }
    if (ext !== null) {
      items.push(
        {
          label: `Extension “*.${ext}” inside “${dir}/”:`,
          heading: true,
          separatorBefore: true
        },
        {
          label: 'only this folder',
          title: `Append \`${dir}/*.${ext}\` to .gitignore`,
          onSelect: ignore({ mode: 'extensionInFolder', depth: 1 })
        },
        {
          label: '1 subfolder level down',
          title: `Append \`${dir}/*.${ext}\` and \`${dir}/*/*.${ext}\` to .gitignore`,
          onSelect: ignore({ mode: 'extensionInFolder', depth: 2 })
        },
        {
          label: '2 subfolder levels down',
          title: `Append \`${dir}/*.${ext}\` … \`${dir}/*/*/*.${ext}\` to .gitignore`,
          onSelect: ignore({ mode: 'extensionInFolder', depth: 3 })
        },
        {
          label: 'all subfolders (any depth)',
          title: `Append \`${dir}/**/*.${ext}\` to .gitignore`,
          onSelect: ignore({ mode: 'extensionInFolder', depth: 'any' })
        }
      )
    }
  }
  items.push(
    { label: '', separator: true },
    {
      label: 'All untracked files',
      title: 'Append every untracked path to .gitignore',
      disabled: !hasUntracked,
      onSelect: ignore({ mode: 'allUntracked' })
    }
  )
  return items
}

// ------------------------------------------------------------------ review

export function ChangesQueue(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  if (state.statusError !== null) {
    return (
      <div className="sidebar-message error">
        <strong>This repository can't be read.</strong>
        <p>{state.statusError}</p>
        <p>
          <button className="mini" onClick={() => void store.refresh()}>
            Try again
          </button>
        </p>
      </div>
    )
  }
  if (state.status === null) {
    return <div className="sidebar-message">Loading…</div>
  }

  const workflow = workflowKind(state.status.inProgress)
  const files = state.status.files
  const shown = files.filter(f => fileMatches(f, state.deskFilter))
  const filtered = files.length > 0 && shown.length !== files.length
  const draftData = state.drafts.get(state.selectedRepo?.path ?? '')
  const allChecked =
    draftData?.checked.size === files.length && files.length > 0
  const someChecked = (draftData?.checked.size ?? 0) > 0 && !allChecked
  const identity = state.identity
  const needsIdentity =
    identity !== null && (identity.name === null || identity.email === null)

  return (
    <div className="changes-list">
      {workflow !== null && (
        <div className="workflow-banner">
          <strong>{workflowLabel(workflow, state.status.conflictCount)}</strong>
          <div className="workflow-actions">
            <button
              className="mini"
              disabled={state.busy !== null}
              onClick={() => store.continueWorkflow(workflow)}
              title="Finish the operation once every conflict is resolved"
            >
              Continue
            </button>
            <button
              className="mini"
              disabled={state.busy !== null}
              onClick={() => store.abortWorkflow(workflow)}
              title="Cancel the operation and restore the previous state"
            >
              Abort
            </button>
          </div>
        </div>
      )}

      {needsIdentity && (
        <div className="workflow-banner warning">
          <strong>Set your git author name and email to commit.</strong>
          <IdentityForm />
        </div>
      )}

      <div className="changes-toolbar">
        <label className="select-all">
          <input
            type="checkbox"
            checked={allChecked}
            ref={el => {
              if (el !== null) el.indeterminate = someChecked
            }}
            onChange={e => store.setAllChecked(e.target.checked)}
          />
          <span>Select all</span>
        </label>
        <div className="changes-toolbar-actions">
          <button
            className="mini"
            title="Stage all changes (Ctrl+Shift+X)"
            disabled={state.busy !== null}
            onClick={() => void store.stageAll()}
          >
            Stage all
          </button>
          <button
            className="mini"
            title="Unstage all changes (Ctrl+Shift+Z)"
            disabled={state.busy !== null}
            onClick={() => void store.unstageAll()}
          >
            Unstage all
          </button>
          <button
            className="mini"
            title="Discard every change in the working tree"
            disabled={state.busy !== null || files.length === 0}
            onClick={() => store.discardAllChanges()}
          >
            Discard all
          </button>
          <button
            className="mini"
            title="Move all changes to the stash (Ctrl+Shift+S)"
            disabled={state.busy !== null || files.length === 0}
            onClick={() => store.stashAllChanges()}
          >
            Stash
          </button>
        </div>
      </div>

      {files.length === 0 && (
        <div className="sidebar-message">
          <strong>No changes</strong>
          <p>Your working directory is clean.</p>
        </div>
      )}

      {files.length > 0 && shown.length === 0 && (
        <div className="sidebar-message">
          <strong>No files match</strong>
          <p>Nothing matches "{state.deskFilter.trim()}".</p>
        </div>
      )}

      {shown.map(f => (
        <FileRow
          key={f.path}
          file={f}
          checked={draftData?.checked.has(f.path) ?? false}
          selected={state.selectedFilePath === f.path}
          onContextMenu={e => {
            e.preventDefault()
            e.stopPropagation()
            setMenu(
              menuStateFromEvent(e, [
                { label: 'Open file', onSelect: () => void store.openFile(f.path) },
                {
                  label: 'Show in Explorer',
                  onSelect: () => void store.revealFile(f.path)
                },
                {
                  label: 'Copy path',
                  separatorBefore: true,
                  onSelect: () => void store.copyText(f.path, 'Path')
                },
                {
                  label: 'Copy file name',
                  onSelect: () =>
                    void store.copyText(
                      f.path.slice(f.path.lastIndexOf('/') + 1),
                      'File name'
                    )
                },
                {
                  label: 'Ignore',
                  separatorBefore: true,
                  title: 'Add .gitignore rules for this path',
                  children: ignoreSubmenu(
                    f,
                    store,
                    state.status?.files.some(x => x.untracked) ?? false
                  )
                },
                {
                  label: 'Discard changes',
                  danger: true,
                  onSelect: () => store.discardFile(f.path)
                }
              ])
            )
          }}
        />
      ))}

      {filtered && (
        <div className="filter-meta">
          showing {shown.length} of {files.length}
        </div>
      )}
      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------- history

export function HistoryQueue(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  return (
    <div className="changes-list">
      <div className="changes-toolbar history-filters">
        <input
          className="filter-input"
          placeholder="Author"
          aria-label="Filter commits by author"
          value={state.logAuthor}
          onChange={e => store.setLogAuthor(e.target.value)}
        />
      </div>

      {state.commitsLoading && state.commits.length === 0 && (
        <div className="sidebar-message">Loading history…</div>
      )}
      {state.logError !== null && (
        <div className="sidebar-message error">
          <strong>History can't be read.</strong>
          <p>{state.logError}</p>
          <p>
            <button className="mini" onClick={() => void store.refreshLog()}>
              Try again
            </button>
          </p>
        </div>
      )}
      {!state.commitsLoading &&
        state.logError === null &&
        state.commits.length === 0 && (
          <div className="sidebar-message">
            <strong>
              {state.logSearch.length > 0 || state.logAuthor.length > 0
                ? 'No commits match'
                : 'No commits yet'}
            </strong>
            <p>
              {state.logSearch.length > 0 || state.logAuthor.length > 0
                ? 'Try a different search or author.'
                : 'Your history will show up here.'}
            </p>
          </div>
        )}

      {state.commits.map(c => (
        <div
          key={c.sha}
          className={`commit-row${state.selectedCommit?.sha === c.sha ? ' selected' : ''}`}
          onClick={() => void store.selectCommit(c)}
          onContextMenu={e => {
            e.preventDefault()
            void store.selectCommit(c)
            setMenu(
              menuStateFromEvent(e, [
                {
                  label: 'Copy full SHA',
                  onSelect: () => void store.copyText(c.sha, 'Commit SHA')
                },
                {
                  label: 'Create branch from commit…',
                  onSelect: () => store.createBranchFromSelectedCommit()
                },
                {
                  label: 'Cherry-pick commit…',
                  onSelect: () => store.cherryPickSelectedCommit()
                },
                {
                  label: 'Revert commit…',
                  danger: true,
                  onSelect: () => store.revertSelectedCommit()
                },
                {
                  label: 'View commit on GitHub',
                  separatorBefore: true,
                  onSelect: () => void store.viewOnGitHub({ kind: 'commit', sha: c.sha })
                }
              ])
            )
          }}
        >
          <span className="avatar" title={c.authorName}>
            {initials(c.authorName)}
          </span>
          <span className="commit-summary">
            {c.summary}
            {c.isMerge && <span className="badge">merge</span>}
          </span>
          <span className="commit-meta">
            {relativeTime(c.date)}
            <br />
            <small>{c.sha.slice(0, 7)}</small>
          </span>
        </div>
      ))}

      {state.commits.length > 0 && !state.logExhausted && (
        <button
          className="mini load-more"
          disabled={state.commitsLoading}
          onClick={() => void store.loadMoreCommits()}
        >
          {state.commitsLoading ? 'Loading…' : 'Load more commits'}
        </button>
      )}
      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

// --------------------------------------------------------------- conflicts

export function ConflictsQueue(): JSX.Element {
  const state = useStoreState()
  const conflicted = (state.status?.files ?? []).filter(
    f => f.kind === 'conflicted'
  )
  const shown = conflicted.filter(f => fileMatches(f, state.deskFilter))

  if (conflicted.length === 0) {
    return (
      <div className="sidebar-message">
        <strong>No conflicts</strong>
        <p>Nothing in the working tree is waiting to be resolved.</p>
      </div>
    )
  }

  return (
    <div className="changes-list">
      <div className="queue-label">
        Conflicted files <b>{shown.length === conflicted.length ? conflicted.length : `${shown.length} of ${conflicted.length}`}</b>
      </div>
      {shown.length === 0 && (
        <div className="sidebar-message">
          <strong>No files match</strong>
          <p>Nothing matches "{state.deskFilter.trim()}".</p>
        </div>
      )}
      {shown.map(f => (
        <FileRow
          key={f.path}
          file={f}
          checked={false}
          showCheck={false}
          selected={state.selectedFilePath === f.path}
        />
      ))}
    </div>
  )
}

export function ResolveHelp(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const conflicted = (state.status?.files ?? []).filter(
    f => f.kind === 'conflicted'
  ).length
  const workflow = workflowKind(state.status?.inProgress ?? { merge: false, rebase: false, cherryPick: false, revert: false })

  return (
    <div className="resolve-help">
      {conflicted > 0 ? (
        <>
          <strong>
            {conflicted} conflicted file{conflicted === 1 ? '' : 's'}
          </strong>
          <p>
            Choose <b>ours</b> to keep your branch's version, <b>theirs</b> to
            take the incoming one, or <b>done</b> after editing the markers by
            hand. The diff shows the conflict markers as they sit on disk.
          </p>
          {workflow !== null && (
            <>
              <p>
                When nothing is left conflicted, <b>Continue</b> finishes the{' '}
                {workflow === 'merge' ? 'merge' : workflow === 'rebase' ? 'rebase' : workflow === 'revert' ? 'revert' : 'cherry-pick'}
                ; <b>Abort</b> restores the state from before it started.
              </p>
              <div className="workflow-actions">
                <button
                  className="btn"
                  disabled={state.busy !== null || conflicted > 0}
                  onClick={() => store.continueWorkflow(workflow)}
                >
                  Continue
                </button>
                <button
                  className="btn"
                  disabled={state.busy !== null}
                  onClick={() => store.abortWorkflow(workflow)}
                >
                  Abort
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <strong>Nothing is conflicted — you're clear.</strong>
          <p>
            Back to <b>Review</b> to commit the resolved files; git already
            staged the ones you marked done.
          </p>
          {workflow !== null && (
            <div className="workflow-actions">
              <button
                className="btn primary"
                disabled={state.busy !== null}
                onClick={() => store.continueWorkflow(workflow)}
              >
                Continue {workflow === 'merge' ? 'merge' : workflow === 'rebase' ? 'rebase' : workflow === 'revert' ? 'revert' : 'cherry-pick'}
              </button>
              <button
                className="btn"
                disabled={state.busy !== null}
                onClick={() => store.abortWorkflow(workflow)}
              >
                Abort
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ stash

export function StashQueue(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const shown = state.stashes.filter(s =>
    matches(`${s.message} ${s.branch} ${s.label}`, state.deskFilter)
  )

  return (
    <div className="changes-list">
      <div className="queue-label">
        Stashes <b>{shown.length === state.stashes.length ? state.stashes.length : `${shown.length} of ${state.stashes.length}`}</b>
      </div>
      {state.stashes.length === 0 && (
        <div className="sidebar-message">
          <strong>Nothing is stashed</strong>
          <p>
            Use <b>Stash</b> in the Review toolbar to park all working changes
            here.
          </p>
        </div>
      )}
      {shown.length === 0 && state.stashes.length > 0 && (
        <div className="sidebar-message">
          <strong>No stashes match</strong>
          <p>Nothing matches "{state.deskFilter.trim()}".</p>
        </div>
      )}
      {shown.map(entry => (
        <div
          key={entry.label}
          className={`stash-row${state.selectedStashIndex === entry.index ? ' selected' : ''}`}
          onClick={() => store.selectStash(entry.index)}
        >
          <span className="stash-message" title={entry.message}>
            {entry.message || entry.label}
            {entry.branch.length > 0 && (
              <small className="file-dir"> on {entry.branch}</small>
            )}
            {entry.date.length > 0 && (
              <small className="file-dir"> · {relativeTime(entry.date)}</small>
            )}
          </span>
          <span className="conflict-actions" onClick={e => e.stopPropagation()}>
            <button
              className="mini"
              title="Restore these changes and keep the stash entry"
              disabled={state.busy !== null}
              onClick={() => store.restoreStash(entry, false)}
            >
              Apply
            </button>
            <button
              className="mini"
              title="Restore these changes and remove the stash entry"
              disabled={state.busy !== null}
              onClick={() => store.restoreStash(entry, true)}
            >
              Pop
            </button>
            <button
              className="mini danger"
              title="Delete this stash permanently"
              disabled={state.busy !== null}
              onClick={() => store.dropStash(entry)}
            >
              Drop
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}

export function StashDetail(): JSX.Element {
  const state = useStoreState()
  const entry = state.stashes.find(s => s.index === state.selectedStashIndex)
  if (entry === undefined) {
    return (
      <div className="diff-view empty-diff">
        <h2>{state.stashes.length === 0 ? 'Nothing is stashed' : 'Select a stash'}</h2>
        <p>
          {state.stashes.length === 0
            ? 'Stashed changes will appear here, ready to apply back to your working directory.'
            : 'Pick a stash on the left to see where it came from and restore it.'}
        </p>
      </div>
    )
  }
  return (
    <div className="stash-detail">
      <div className="stash-detail-head">
        <strong>{entry.message || entry.label}</strong>
        <code>{entry.label}</code>
      </div>
      <div className="stash-detail-meta">
        {entry.branch.length > 0 ? `Stashed from ${entry.branch}` : 'Stashed'}
        {entry.date.length > 0 ? ` · ${new Date(entry.date).toLocaleString()}` : ''}
      </div>
      <p className="stash-detail-note">
        <b>Apply</b> restores these changes and keeps the entry; <b>Pop</b>{' '}
        restores and removes it. A restore needs a clean working directory —
        commit or discard current changes first.
      </p>
    </div>
  )
}

// ------------------------------------------------------------ commit tray

export function CommitTray(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const { nonce: celebrateNonce, celebrating } = useCelebration('commit')
  const draft = state.drafts.get(state.selectedRepo?.path ?? '')
  const summary = draft?.summary ?? ''
  const description = draft?.description ?? ''
  const branch = state.status?.branch ?? 'main'
  const overlong = summary.length > 50
  const amending = state.amend !== null
  const busy = state.busy !== null
  const total = state.status?.files.length ?? 0
  const ahead = state.status?.ahead ?? 0
  const hasUpstream = state.status?.upstream !== undefined
  const checked = draft?.checked ?? new Set<string>()
  const scopeTitle =
    checked.size === 0
      ? 'No files selected — Commit ships nothing until you check a file.'
      : `This commit will contain exactly:\n${[...checked].join('\n')}`

  return (
    <>
      {amending && (
        <div className="amend-bar">
          <span>
            Editing <code>{state.amend?.sha.slice(0, 7)}</code>
          </span>
          <button className="mini" onClick={() => store.cancelAmend()}>
            Cancel
          </button>
        </div>
      )}
      <div className="commit-field">
        <input
          className={`summary${overlong ? ' overlong' : ''}`}
          placeholder="Summary (required)"
          aria-label="Commit summary"
          value={summary}
          onChange={e => store.setSummary(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void store.commit()
            }
          }}
        />
        {overlong && (
          <span className="length-warning">
            {summary.length} — keep summaries under 50 characters
          </span>
        )}
      </div>
      <textarea
        className="description"
        placeholder="Description"
        aria-label="Commit description"
        rows={3}
        value={description}
        onChange={e => store.setDescription(e.target.value)}
      />
      <div className="scope-line" title={scopeTitle}>
        <b>{checked.size} of {total}</b> files ·{' '}
        {state.scopeLoading ? (
          <>
            <span className="scope-adds">+…</span>{' '}
            <span className="scope-dels">−…</span>
          </>
        ) : (
          <>
            <span className="scope-adds">+{state.scopeAdds}</span>{' '}
            <span className="scope-dels">−{state.scopeDels}</span>
          </>
        )}
      </div>
      <div className="commit-actions">
        {state.aiBusy ? (
          <button
            className="btn ai"
            onClick={() => store.cancelGeneration()}
            title="Cancel generation"
          >
            <span className="spinner" /> Cancel
          </button>
        ) : (
          <button
            className="btn ai"
            disabled={busy}
            onClick={() => void store.generateCommitMessage()}
            title="Generate a commit message with AI for the selected files"
          >
            ✨ Generate
          </button>
        )}
        <button
          className={`btn primary commit${celebrating ? ' celebrating' : ''}`}
          disabled={busy || state.aiBusy || (checked.size === 0 && !amending)}
          onClick={() => void store.commit()}
          title={
            checked.size === 0 && !amending
              ? 'Select at least one file to commit'
              : 'Commit selected files (Ctrl+Enter)'
          }
        >
          {state.busy === 'commit' ? (
            <>
              <span className="spinner" /> {amending ? 'Amending…' : 'Committing…'}
            </>
          ) : amending ? (
            <>Amend commit</>
          ) : (
            <>Commit to {branch}</>
          )}
          {celebrating && <ConfettiBurst nonce={celebrateNonce} />}
        </button>
        <button
          className="btn push"
          disabled={
            busy ||
            state.aiBusy ||
            state.status === null ||
            (ahead === 0 && hasUpstream)
          }
          onClick={() => void store.doSync('push')}
          title={pushTitle(state)}
        >
          {state.busy === 'push' ? (
            <>
              <span className="spinner" /> Pushing…
            </>
          ) : (
            <>
              ↑ Push
              {ahead > 0 ? (
                <span className="count-pop" key={`tray-push-count-${ahead}`}>
                  {' '}{ahead}
                </span>
              ) : (
                ''
              )}
            </>
          )}
        </button>
      </div>
    </>
  )
}

function pushTitle(state: AppState): string {
  if (state.status === null) return 'Loading repository status…'
  if (state.status.upstream === undefined) {
    return 'No upstream branch yet — Push publishes this branch and sets upstream on origin'
  }
  const ahead = state.status.ahead ?? 0
  return ahead > 0
    ? `Push ${ahead} commit${ahead === 1 ? '' : 's'} to ${state.status.upstream}`
    : `Nothing to push — ${state.status.branch} is up to date with ${state.status.upstream}`
}

// ----------------------------------------------------------------- shared

function workflowKind(
  inProgress: { merge: boolean; rebase: boolean; cherryPick: boolean; revert: boolean }
): 'merge' | 'rebase' | 'cherryPick' | 'revert' | null {
  if (inProgress.rebase) return 'rebase'
  if (inProgress.merge) return 'merge'
  if (inProgress.revert) return 'revert'
  if (inProgress.cherryPick) return 'cherryPick'
  return null
}

function workflowLabel(
  kind: 'merge' | 'rebase' | 'cherryPick' | 'revert',
  conflicts: number
): string {
  const base =
    kind === 'merge'
      ? 'Merge in progress'
      : kind === 'rebase'
        ? 'Rebase in progress'
        : kind === 'revert'
          ? 'Revert in progress'
          : 'Cherry-pick in progress'
  return conflicts > 0 ? `${base} — ${conflicts} conflict${conflicts === 1 ? '' : 's'}` : base
}

function IdentityForm(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const [name, setName] = useState(state.identity?.name ?? '')
  const [email, setEmail] = useState(state.identity?.email ?? '')
  const [saving, setSaving] = useState(false)

  return (
    <div className="identity-form">
      <input
        placeholder="Author name"
        aria-label="Author name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <input
        placeholder="you@example.com"
        aria-label="Author email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <button
        className="mini"
        disabled={saving || name.trim().length === 0 || email.trim().length === 0}
        onClick={() => {
          setSaving(true)
          void store.saveIdentity(name, email).finally(() => setSaving(false))
        }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function FileRow({
  file,
  checked,
  selected,
  showCheck = true,
  onContextMenu
}: {
  file: FileStatus
  checked: boolean
  selected: boolean
  showCheck?: boolean
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void
}): JSX.Element {
  const store = useStore()
  const dir = file.path.includes('/')
    ? file.path.slice(0, file.path.lastIndexOf('/') + 1)
    : ''
  const name = file.path.slice(dir.length)

  const kindLabel =
    file.kind === 'new'
      ? file.untracked
        ? 'new'
        : 'added'
      : file.kind === 'renamed'
        ? 'renamed'
        : file.kind === 'deleted'
          ? 'deleted'
          : file.kind === 'conflicted'
            ? 'conflict'
            : file.kind === 'copied'
              ? 'copied'
              : file.kind === 'type-changed'
                ? 'type'
                : 'modified'

  return (
    <div
      className={`file-row${selected ? ' selected' : ''}${file.kind === 'conflicted' ? ' conflicted' : ''}`}
      onClick={() => void store.selectFile(file.path)}
      onContextMenu={onContextMenu}
    >
      {showCheck && (
        <input
          type="checkbox"
          checked={checked}
          title="Include in this commit"
          onClick={e => e.stopPropagation()}
          onChange={() => store.toggleCheck(file.path)}
        />
      )}
      <span className={`status-glyph ${file.kind}`} title={kindLabel}>
        {file.kind === 'new'
          ? '＋'
          : file.kind === 'deleted'
            ? '－'
            : file.kind === 'conflicted'
              ? '!'
              : file.kind === 'renamed' || file.kind === 'copied'
                ? '⇄'
                : '●'}
      </span>
      <span className="file-path">
        <span className="file-dir">{dir}</span>
        <span className="file-name">{name}</span>
      </span>
      {file.kind === 'conflicted' ? (
        <span className="conflict-actions" onClick={e => e.stopPropagation()}>
          <button
            className="mini"
            title="Keep the version from your branch"
            onClick={() => store.resolveConflict(file.path, 'ours')}
          >
            ours
          </button>
          <button
            className="mini"
            title="Take the incoming version"
            onClick={() => store.resolveConflict(file.path, 'theirs')}
          >
            theirs
          </button>
          <button
            className="mini"
            title="Stage the file as it is (markers edited away by hand)"
            onClick={() => store.resolveConflict(file.path, 'resolved')}
          >
            done
          </button>
        </span>
      ) : (
        <>
          {file.staged ? (
            <button
              className="badge staged"
              title="Staged — click to unstage"
              onClick={e => {
                e.stopPropagation()
                store.toggleStaged(file.path)
              }}
            >
              staged
            </button>
          ) : (
            file.hasWorktreeChanges && (
              <span className="badge unstaged">unstaged</span>
            )
          )}
          <button
            className="discard"
            title="Discard changes"
            onClick={e => {
              e.stopPropagation()
              store.discardFile(file.path)
            }}
          >
            ×
          </button>
        </>
      )}
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}
