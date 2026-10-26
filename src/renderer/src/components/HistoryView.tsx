import type { JSX } from 'react'
import { useState } from 'react'
import { DiffView } from './DiffView'
import {
  ContextMenu,
  menuStateFromEvent,
  type ContextMenuState
} from './ContextMenu'
import { useStore, useStoreState } from '../store'

/**
 * Main pane for the History tab: selected commit details + its changed
 * files + the per-file diff (GHD shows commit files in the sidebar; we show
 * them in the middle since the sidebar keeps the commit list).
 */
export function HistoryView(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const commit = state.selectedCommit

  if (commit === null) {
    return (
      <div className="diff-view empty-diff">
        <h2>Select a commit</h2>
        <p>Pick a commit from the history list to see the changes it introduced.</p>
      </div>
    )
  }

  return (
    <div className="history-view">
      <div className="commit-detail">
        <div className="commit-detail-head">
          <strong>{commit.summary}</strong>
          {commit.isMerge && <span className="badge">merge</span>}
          <div className="commit-actions-inline">
            <button
              className="mini"
              title="Copy the full SHA"
              onClick={() => void store.copyText(commit.sha, 'Commit SHA')}
            >
              Copy SHA
            </button>
            {state.commits[0]?.sha === commit.sha && (
              <button
                className="mini"
                title="Load this commit's message into the commit box for rewriting"
                disabled={state.busy !== null}
                onClick={() => void store.editLastCommit()}
              >
                Edit latest
              </button>
            )}
            <button
              className="mini"
              title="Create a branch starting at this commit"
              onClick={() => store.createBranchFromSelectedCommit()}
            >
              Branch from here
            </button>
            <button
              className="mini"
              title="Apply this commit onto the current branch"
              disabled={state.busy !== null}
              onClick={() => store.cherryPickSelectedCommit()}
            >
              Cherry-pick
            </button>
            <button
              className="mini danger"
              title="Create a commit that undoes this one"
              disabled={state.busy !== null}
              onClick={() => store.revertSelectedCommit()}
            >
              Revert
            </button>
            {state.remoteUrl !== null && (
              <button
                className="mini"
                title="Open this commit in the browser"
                onClick={() => void store.viewOnGitHub({ kind: 'commit', sha: commit.sha })}
              >
                View on GitHub
              </button>
            )}
          </div>
        </div>
        <div className="commit-detail-meta">
          {commit.authorName} &lt;{commit.authorEmail}&gt; ·{' '}
          {new Date(commit.date).toLocaleString()} · {commit.sha.slice(0, 10)}
          {commit.parents.length > 1 && ` · ${commit.parents.length} parents`}
        </div>
        {commit.body.length > 0 && (
          <pre className="commit-detail-body">{commit.body}</pre>
        )}
      </div>

      <div className="history-body">
        <div className="commit-files">
          <div className="commit-files-head">
            Changed files ({state.commitFiles.length})
          </div>
          {state.commitFilesLoading && (
            <div className="sidebar-message">Loading files…</div>
          )}
          {state.commitFilesError !== null && (
            <div className="sidebar-message error">
              <strong>Can't list this commit's files.</strong>
              <p>{state.commitFilesError}</p>
              <p>
                <button
                  className="mini"
                  onClick={() => void store.selectCommit(commit)}
                >
                  Try again
                </button>
              </p>
            </div>
          )}
          {!state.commitFilesLoading &&
            state.commitFilesError === null &&
            state.commitFiles.length === 0 && (
              <div className="sidebar-message">
                <strong>No files</strong>
                <p>This commit has no changes to show.</p>
              </div>
            )}
          {state.commitFiles.map(f => (
            <div
              key={f.path}
              className={`file-row compact${
                state.selectedCommitFilePath === f.path ? ' selected' : ''
              }`}
              onClick={() => void store.selectCommitFile(f.path)}
              onContextMenu={e => {
                e.preventDefault()
                setMenu(
                  menuStateFromEvent(e, [
                    {
                      label: 'Copy path',
                      onSelect: () => void store.copyText(f.path, 'Path')
                    },
                    {
                      label: 'Show in Explorer',
                      onSelect: () => void store.revealFile(f.path)
                    }
                  ])
                )
              }}
            >
              <span className={`status-glyph ${f.kind}`}>
                {f.kind === 'new'
                  ? '＋'
                  : f.kind === 'deleted'
                    ? '－'
                    : f.kind === 'renamed' || f.kind === 'copied'
                      ? '⇄'
                      : '●'}
              </span>
              <span className="file-path">
                <span className="file-name">{f.path}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="history-diff">
          <DiffView
            diff={state.selectedCommitFileDiff}
            title={state.selectedCommitFilePath}
            error={state.selectedCommitFileError}
            preview={state.selectedCommitFilePreview}
            onRetry={
              state.selectedCommitFilePath !== null
                ? () => void store.selectCommitFile(state.selectedCommitFilePath!)
                : undefined
            }
            emptyTitle="Select a file"
            emptyHint="Choose one of the changed files to see its diff."
          />
        </div>
      </div>
      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
