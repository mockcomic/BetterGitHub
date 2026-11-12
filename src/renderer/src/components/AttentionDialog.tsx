import type { JSX } from 'react'
import { useStore, useStoreState } from '../store'
import { conflictedPaths, workflowKindOf, workflowNoun } from '../attention'
import { Dialog } from './Dialog'

/**
 * The needs-attention modal — centered above the desk, so a merge that
 * stopped on conflicts or a push the remote refused cannot be missed the
 * way an expiring corner toast can. The conflicts phase renders the live
 * conflicted list: the quick `ours` / `theirs` / ✨ AI resolves act in
 * place, a click walks the visitor to that file in the desk, and the
 * moment the last conflict clears the dialog answers the question the
 * operation actually has — finish it, or abandon it. A notice is the
 * quieter sibling: the story, the one verb that fixes it, and a Later that
 * stays honest because the desk keeps showing the state either way.
 */
export function AttentionDialog(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  const request = state.attention
  if (request === null) return null

  const dismiss = (): void => {
    store.dismissAttention()
  }

  if (request.kind === 'notice') {
    return (
      <Dialog
        title={request.title}
        onClose={dismiss}
        footer={
          <>
            <button className="btn" onClick={dismiss}>
              {request.dismissLabel}
            </button>
            {request.actions.map(action => (
              <button
                key={action.label}
                className={`btn${action.primary === true ? ' primary' : ''}${
                  action.danger === true ? ' destructive' : ''
                }`}
                onClick={() => {
                  dismiss()
                  action.onClick()
                }}
              >
                {action.label}
              </button>
            ))}
          </>
        }
      >
        <p className="confirm-message">{request.message}</p>
      </Dialog>
    )
  }

  // Conflicts: derive everything from the live status — never a snapshot,
  // so the dialog and the desk cannot disagree mid-resolution.
  const status = state.status
  if (status === null) return null
  const conflicted = conflictedPaths(status)
  const kind = workflowKindOf(status.inProgress)
  // The episode is over and nothing is paused; refresh retires the request,
  // but the paint must not briefly lie.
  if (conflicted.length === 0 && kind === null) return null
  const busy = state.busy !== null
  const batch = state.aiBatch

  const abort = (): void => {
    if (kind === null) return
    dismiss()
    store.abortWorkflow(kind)
  }

  const footer = (
    <>
      <button className="btn" onClick={dismiss}>
        Later
      </button>
      {conflicted.length === 0 ? (
        <>
          {kind !== null && (
            <button className="btn" disabled={busy} onClick={abort}>
              Abort {workflowNoun(kind)}
            </button>
          )}
          {kind !== null && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => {
                if (kind === null) return
                dismiss()
                store.continueWorkflow(kind)
              }}
            >
              Continue {workflowNoun(kind)}
            </button>
          )}
        </>
      ) : (
        <>
          {kind !== null && (
            <button className="btn" disabled={busy} onClick={abort}>
              Abort {workflowNoun(kind)}
            </button>
          )}
          {conflicted.length > 1 && batch === null && (
            <button
              className="btn ai"
              disabled={busy || state.aiMerge !== null}
              title="Run the merge agent over every conflicted file, one after another. It will not stop to ask in this mode — anything it refuses to guess stays conflicted for you."
              onClick={() => store.resolveAllConflictsWithAi()}
            >
              ✨ Resolve all
            </button>
          )}
          {batch !== null && (
            <button
              className="btn ai"
              title="Stop the pass; files it already merged stay merged"
              onClick={() => store.stopAiBatch()}
            >
              <span className="spinner" /> Stop —{' '}
              {Math.min(batch.outcomes.length + 1, batch.total)} of {batch.total}
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => {
              dismiss()
              store.setView('conflicts')
            }}
          >
            Review in the desk
          </button>
        </>
      )}
    </>
  )

  return (
    <Dialog title={request.title} width={560} onClose={dismiss} footer={footer}>
      {conflicted.length === 0 ? (
        <p className="confirm-message">
          Every conflict is resolved. <b>Continue</b> finishes the{' '}
          {kind !== null ? workflowNoun(kind) : 'operation'}; <b>Abort</b>{' '}
          restores the state from before it started.
        </p>
      ) : (
        <>
          <p className="confirm-message">
            {conflicted.length === 1
              ? 'One file is conflicted.'
              : `${conflicted.length} files are conflicted.`}{' '}
            Keep your side, take the incoming one, or let ✨ AI combine both —
            then finish or abandon the operation.
            {conflicted.length > 1 && (
              <>
                {' '}
                <b>✨ Resolve all</b> runs the agent over the whole list: it
                merges what it can and leaves the rest conflicted.
              </>
            )}
          </p>
          <ul className="attention-files" aria-label="Conflicted files">
            {conflicted.map(path => (
              <li key={path} className="attention-file">
                <button
                  type="button"
                  className="attention-file-path"
                  title="Open this file in the Conflicts desk"
                  onClick={() => {
                    dismiss()
                    store.setView('conflicts')
                    void store.selectFile(path)
                  }}
                >
                  {path}
                </button>
                <span className="conflict-actions">
                  <button
                    className={`mini ai${
                      batch?.current === path ? ' thinking' : ''
                    }`}
                    title={
                      batch !== null
                        ? 'The ✨ Resolve all pass is working through the conflicted list'
                        : 'Ask the AI merge agent to combine both sides — it asks you when unsure'
                    }
                    disabled={state.aiMerge !== null || batch !== null}
                    onClick={() => store.startAiMerge(path)}
                  >
                    {batch?.current === path ? '…' : '✨ AI'}
                  </button>
                  <button
                    className="mini"
                    title="Keep the version from your branch"
                    disabled={busy || batch !== null}
                    onClick={() => store.resolveConflict(path, 'ours')}
                  >
                    ours
                  </button>
                  <button
                    className="mini"
                    title="Take the incoming version"
                    disabled={busy || batch !== null}
                    onClick={() => store.resolveConflict(path, 'theirs')}
                  >
                    theirs
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  )
}
