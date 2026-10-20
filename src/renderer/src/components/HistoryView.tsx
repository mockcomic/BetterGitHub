import type { JSX } from 'react'
import { DiffView } from './DiffView'
import { useStore, useStoreState } from '../store'

/**
 * Main pane for the History tab: selected commit details + its changed
 * files + the per-file diff (GHD shows commit files in the sidebar; we show
 * them in the middle since the sidebar keeps the commit list).
 */
export function HistoryView(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
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
        </div>
        <div className="commit-detail-meta">
          {commit.authorName} &lt;{commit.authorEmail}&gt; ·{' '}
          {new Date(commit.date).toLocaleString()} · {commit.sha.slice(0, 10)}
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
          {state.commitFiles.map(f => (
            <div
              key={f.path}
              className={`file-row compact${
                state.selectedCommitFilePath === f.path ? ' selected' : ''
              }`}
              onClick={() => void store.selectCommitFile(f.path)}
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
            emptyTitle="Select a file"
            emptyHint="Choose one of the changed files to see its diff."
          />
        </div>
      </div>
    </div>
  )
}
