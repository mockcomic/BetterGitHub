import type { JSX } from 'react'
import type { PackageScript } from '../../../shared/scripts'
import { useStore, useStoreState } from '../store'

/**
 * The Scripts desk: every entry of the repository root's package.json,
 * each with one ▶ Run button. Pressing it docks the integrated terminal,
 * opens a tab labelled with the command, and *types* the line into a fresh
 * shell (store.runScript → TerminalPanel) — so streaming output, colours,
 * Ctrl+C, and the live prompt after the script exits are the terminal's
 * existing behaviour, not new machinery.
 *
 * The tab itself only appears when the repository actually has scripts
 * (App.tsx's visibleDeskTabs), following the desk's "tabs that have
 * something to say" rule.
 */

function ScriptRow({ script, manager }: { script: PackageScript; manager: string }): JSX.Element {
  const store = useStore()
  return (
    <div className="script-row">
      <button
        className="mini run"
        title={`Run “${script.name}” — types ${manager} run ${script.name} into a new terminal tab`}
        onClick={() => store.runScript(script.name)}
      >
        ▶
      </button>
      <span className="script-info">
        <span className="script-name">{script.name}</span>
        <span className="script-command" title={script.command}>
          {script.command}
        </span>
      </span>
    </div>
  )
}

export function ScriptsQueue(): JSX.Element {
  const state = useStoreState()
  const store = useStore()
  const info = state.packageScripts

  if (info === null) {
    return <div className="sidebar-message">Loading…</div>
  }
  if (info.error !== null) {
    return (
      <div className="sidebar-message error">
        <strong>package.json can't be read.</strong>
        <p>{info.error}</p>
        <p>
          <button className="mini" onClick={() => void store.refreshPackageScripts()}>
            Try again
          </button>
        </p>
      </div>
    )
  }
  // The desk's own filter narrows the script list like it does the review
  // queue — one habit for every column on the desk.
  const needle = state.deskFilter.trim().toLowerCase()
  const shown =
    needle.length === 0
      ? info.scripts
      : info.scripts.filter(
          s => s.name.toLowerCase().includes(needle) || s.command.toLowerCase().includes(needle)
        )

  return (
    <div className="changes-list">
      <div className="queue-label">
        Scripts <b>{shown.length === info.scripts.length ? info.scripts.length : `${shown.length} of ${info.scripts.length}`}</b>
        <span className="script-manager">{info.manager}</span>
      </div>
      {shown.length === 0 && (
        <div className="sidebar-message">
          <strong>No scripts match</strong>
          <p>Nothing matches "{state.deskFilter.trim()}".</p>
        </div>
      )}
      {shown.map(s => (
        <ScriptRow key={s.name} script={s} manager={info.manager} />
      ))}
      <p className="script-hint">
        ▶ opens the script in the integrated terminal — output streams there,
        Ctrl+C stops it, and the prompt stays live after it exits.
      </p>
    </div>
  )
}

export function ScriptsDetail(): JSX.Element {
  const state = useStoreState()
  const info = state.packageScripts
  return (
    <div className="diff-view empty-diff">
      <h2>Package scripts</h2>
      <p>
        {info !== null && info.scripts.length > 0 ? (
          <>
            Press <b>▶</b> next to a script to run it in the integrated
            terminal — <code>{info.manager} run &lt;name&gt;</code> is typed
            into a fresh tab, exactly as if you had. Long-running scripts like
            a dev server keep their tab streaming until you stop them with
            Ctrl+C; the shell prompt is still there afterwards, so
            <b> ↑</b> + Enter starts the script again.
          </>
        ) : (
          'This repository has no runnable package scripts.'
        )}
      </p>
    </div>
  )
}
