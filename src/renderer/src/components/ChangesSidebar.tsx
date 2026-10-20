import type { JSX } from 'react'
import type { FileStatus } from '../../../shared/models'
import { useStore, useStoreState } from '../store'
import { relativeTime } from '../time'

export function ChangesSidebar(): JSX.Element {
  const state = useStoreState()
  const store = useStore()

  return (
    <aside className="sidebar">
      <div className="segmented">
        <button
          className={state.activeTab === 'changes' ? 'seg active' : 'seg'}
          onClick={() => store.setActiveTab('changes')}
        >
          Changes{state.status ? ` (${state.status.files.length})` : ''}
        </button>
        <button
          className={state.activeTab === 'history' ? 'seg active' : 'seg'}
          onClick={() => store.setActiveTab('history')}
        >
          History{state.commits.length > 0 ? ` (${state.commits.length})` : ''}
        </button>
      </div>

      {state.activeTab === 'changes' ? <ChangesList /> : <HistoryList />}
      {state.activeTab === 'changes' && <CommitBox />}
    </aside>
  )
}

function ChangesList(): JSX.Element {
  const state = useStoreState()
  const store = useStore()

  if (state.statusError !== null) {
    return (
      <div className="sidebar-message error">
        <strong>This repository can't be read.</strong>
        <p>{state.statusError}</p>
      </div>
    )
  }
  if (state.status === null) {
    return <div className="sidebar-message">Loading…</div>
  }
  if (state.status.files.length === 0) {
    return (
      <div className="sidebar-message">
        <strong>No changes</strong>
        <p>Your working directory is clean.</p>
      </div>
    )
  }

  const draftData = state.drafts.get(state.selectedRepo?.path ?? '')
  const allChecked =
    draftData?.checked.size === state.status.files.length &&
    state.status.files.length > 0

  return (
    <div className="changes-list">
      <div className="changes-toolbar">
        <label className="select-all">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={e => store.setAllChecked(e.target.checked)}
          />
          <span>Select all</span>
        </label>
        <div className="changes-toolbar-actions">
          <button
            className="mini"
            title="Stage all changes (Ctrl+Shift+X)"
            onClick={() => void store.stageAll()}
          >
            Stage all
          </button>
          <button
            className="mini"
            title="Unstage all changes (Ctrl+Shift+Z)"
            onClick={() => void store.unstageAll()}
          >
            Unstage all
          </button>
        </div>
      </div>
      {state.status.files.map(f => (
        <FileRow
          key={f.path}
          file={f}
          checked={draftData?.checked.has(f.path) ?? false}
          selected={state.selectedFilePath === f.path}
        />
      ))}
    </div>
  )
}

function FileRow({
  file,
  checked,
  selected
}: {
  file: FileStatus
  checked: boolean
  selected: boolean
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
    >
      <input
        type="checkbox"
        checked={checked}
        title="Include in this commit"
        onClick={e => e.stopPropagation()}
        onChange={() => store.toggleCheck(file.path)}
      />
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
        file.hasWorktreeChanges && <span className="badge unstaged">unstaged</span>
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
    </div>
  )
}

function HistoryList(): JSX.Element {
  const state = useStoreState()
  const store = useStore()

  if (state.commits.length === 0) {
    return (
      <div className="sidebar-message">
        <strong>No commits yet</strong>
        <p>Your history will show up here.</p>
      </div>
    )
  }

  return (
    <div className="changes-list">
      {state.commits.map(c => (
        <div
          key={c.sha}
          className={`commit-row${state.selectedCommit?.sha === c.sha ? ' selected' : ''}`}
          onClick={() => void store.selectCommit(c)}
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
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function CommitBox(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const draft = state.drafts.get(state.selectedRepo?.path ?? '')
  const summary = draft?.summary ?? ''
  const description = draft?.description ?? ''
  const branch = state.status?.branch ?? 'main'
  const overlong = summary.length > 50

  return (
    <div className="commit-box">
      <div className="commit-field">
        <input
          className={`summary${overlong ? ' overlong' : ''}`}
          placeholder="Summary (required)"
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
        rows={3}
        value={description}
        onChange={e => store.setDescription(e.target.value)}
      />
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
            disabled={state.busy !== null}
            onClick={() => void store.generateCommitMessage()}
            title="Generate a commit message with AI for the selected files"
          >
            ✨ Generate
          </button>
        )}
        <button
          className="btn primary commit"
          disabled={state.busy !== null || state.aiBusy}
          onClick={() => void store.commit()}
          title="Commit selected files (Ctrl+Enter)"
        >
          {state.busy === 'commit' ? (
            <>
              <span className="spinner" /> Committing…
            </>
          ) : (
            <>Commit to {branch}</>
          )}
        </button>
      </div>
    </div>
  )
}
