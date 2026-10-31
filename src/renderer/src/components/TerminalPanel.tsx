import type { JSX } from 'react'
import type { ITerminalOptions, Terminal as XtermTerminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { call, onTerminalExit, onTerminalOutput } from '../api'

/**
 * The integrated terminal panel: one docked xterm.js surface bound to one
 * PTY session in main (src/main/terminal.ts + the channels in
 * src/shared/ipc.ts). Everything here is component-local on purpose — the
 * store only knows whether the panel is open; keystrokes and PTY output
 * never travel through React state.
 *
 * Lifecycle: the session spawns when this component mounts (the panel
 * opening, the repo switching, or the Restart button re-running the effect)
 * and dies on unmount, so closing the panel or swapping repositories never
 * leaves a stray shell. If the shell exits by itself the last output stays
 * readable under a Restart bar.
 */
interface TerminalPanelProps {
  readonly repoPath: string
  readonly repoName: string
}

/** Same stack as the styles.css --mono token (xterm needs a literal string). */
const TERMINAL_FONT =
  "'Cascadia Code', 'Consolas', 'SFMono-Regular', Menlo, monospace"

/** xterm's classic ANSI 16, tuned to sit on Primer's light and dark grounds. */
const ANSI_LIGHT = [
  '#24292f', '#cf222e', '#116329', '#4d3800',
  '#0969da', '#8250df', '#1b7c83', '#6e7781',
  '#57606a', '#a40e26', '#1a7f37', '#7d5300',
  '#218bff', '#a475f9', '#3192aa', '#8c959f'
] as const
const ANSI_DARK = [
  '#0d1117', '#ff7b72', '#3fb950', '#d29922',
  '#58a6ff', '#bc8cff', '#39c5cf', '#b1bac4',
  '#6e7681', '#ffa198', '#56d364', '#e3b341',
  '#79c0ff', '#d2a8ff', '#56d4dd', '#f0f6fc'
] as const

/**
 * Build the xterm palette from the live CSS variables so the terminal always
 * sits on the same ground as the diff it shares the desk with; named themes
 * tint bg/fg/cursor/selection through the variables, while the ANSI block
 * comes from the two base families (like VS Code's default terminal colors).
 */
function terminalTheme(): ITerminalOptions['theme'] {
  const css = getComputedStyle(document.documentElement)
  const read = (name: string): string => css.getPropertyValue(name).trim()
  const dark = document.documentElement.getAttribute('data-theme-base') === 'dark'
  const ansi = dark ? ANSI_DARK : ANSI_LIGHT
  return {
    background: read('--bg') || (dark ? '#0d1117' : '#ffffff'),
    foreground: read('--text') || (dark ? '#e6edf3' : '#1f2328'),
    cursor: read('--accent') || '#0969da',
    cursorAccent: read('--bg') || (dark ? '#0d1117' : '#ffffff'),
    selectionBackground: read('--bg-selected') || '#0969da',
    selectionForeground: read('--on-accent') || '#ffffff',
    black: ansi[0], red: ansi[1], green: ansi[2], yellow: ansi[3],
    blue: ansi[4], magenta: ansi[5], cyan: ansi[6], brightBlack: ansi[7],
    brightRed: ansi[8], brightGreen: ansi[9], brightYellow: ansi[10],
    brightBlue: ansi[11], brightMagenta: ansi[12], brightCyan: ansi[13],
    brightWhite: ansi[14], white: ansi[15]
  }
}

export function TerminalPanel({ repoPath, repoName }: TerminalPanelProps): JSX.Element {
  const store = useStore()
  const hostRef = useRef<HTMLDivElement | null>(null)
  /** The live xterm instance, for the toolbar buttons. */
  const termRef = useRef<XtermTerminal | null>(null)
  const [label, setLabel] = useState('Terminal')
  const [error, setError] = useState<string | null>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)
  /** The live session id, mirrored to the DOM (data-session) for QA probes. */
  const [sessionId, setSessionId] = useState<string | null>(null)
  /** Bumped by Restart; the effect below treats it as a spawn key. */
  const [spawnNonce, setSpawnNonce] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    let disposed = false
    let term: XtermTerminal | null = null
    let sessionId: string | null = null
    let unsubOutput = (): void => {}
    let unsubExit = (): void => {}
    let resizeObserver: ResizeObserver | null = null
    let themeWatcher: MutationObserver | null = null
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    setExitCode(null)
    setError(null)

    // Right-click pastes, the way Windows users expect a terminal to; the
    // window suppresses the native menu, so there is nothing to lose. The
    // handler lives here (not in the async body) so cleanup sees the same
    // function reference. The live terminal is reached through termRef,
    // which the spawn below fills in.
    const onContextMenu = (event: Event): void => {
      event.preventDefault()
      void navigator.clipboard
        ?.readText()
        .then(text => termRef.current?.paste(text))
    }
    host.addEventListener('contextmenu', onContextMenu)

    void (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
        import('@xterm/xterm/css/xterm.css')
      ])
      if (disposed) return

      const terminal = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        fontFamily: TERMINAL_FONT,
        fontSize: 13,
        scrollback: 5000,
        theme: terminalTheme()
      })
      term = terminal
      termRef.current = terminal
      // @xterm/xterm 5.5 moved clipboard conveniences out of the core; the
      // auto-copy half is one line here (copy whenever the selection
      // changes — the classic copyOnSelect behaviour, minus the option),
      // and the paste half is the key handler and the right-click below.
      const fit: FitAddon = new FitAddon()
      terminal.loadAddon(fit)
      terminal.onSelectionChange(() => {
        if (terminal.hasSelection()) {
          void navigator.clipboard?.writeText(terminal.getSelection())
        }
      })
      terminal.loadAddon(
        new WebLinksAddon((event, uri) => {
          event.preventDefault()
          void call('openExternal', uri)
        })
      )
      // Windows-console ergonomics: Ctrl+V (and the Linux/macOS Ctrl+Shift+V
      // spelling, and Cmd+V) pastes; Ctrl+C copies while text is selected
      // and reaches the shell as an interrupt otherwise, like every terminal.
      terminal.attachCustomKeyEventHandler(e => {
        if (e.type !== 'keydown' || (!e.ctrlKey && !e.metaKey)) return true
        const key = e.key.toLowerCase()
        if (key === 'v') {
          void navigator.clipboard?.readText().then(text => terminal.paste(text))
          return false
        }
        if (key === 'c' && !e.shiftKey && terminal.hasSelection()) {
          void navigator.clipboard?.writeText(terminal.getSelection())
          return false
        }
        return true
      })
      terminal.open(host)
      try {
        fit.fit()
      } catch {
        /* a zero-size host (mid-animation) just falls back below */
      }
      const dims = fit.proposeDimensions() ?? { cols: 80, rows: 24 }

      try {
        const info = await call('terminalStart', repoPath, dims.cols, dims.rows)
        if (disposed) {
          void call('terminalKill', info.id)
          return
        }
        sessionId = info.id
        setSessionId(info.id)
        setLabel(info.shellLabel)
        terminal.focus()
        unsubOutput = onTerminalOutput((id, data) => {
          if (id === sessionId) terminal.write(data)
        })
        unsubExit = onTerminalExit((id, code) => {
          if (id === sessionId) {
            sessionId = null
            setSessionId(null)
            setExitCode(code)
          }
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return
      }

      const refit = (): void => {
        if (sessionId === null) return
        try {
          fit.fit()
        } catch {
          return
        }
        const next = fit.proposeDimensions()
        if (next !== undefined) void call('terminalResize', sessionId, next.cols, next.rows)
      }
      // Resize events stream fast while dragging; one PTY resize per settle
      // is all the shell needs (the render grid follows the host regardless).
      resizeObserver = new ResizeObserver(() => {
        if (resizeTimer !== null) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(refit, 100)
      })
      resizeObserver.observe(host)

      // A settings save rewrites the data-theme attributes synchronously;
      // re-read the palette from the CSS variables when that happens.
      themeWatcher = new MutationObserver(() => {
        terminal.options.theme = terminalTheme()
      })
      themeWatcher.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'data-theme-base']
      })
    })()

    return () => {
      disposed = true
      if (resizeTimer !== null) clearTimeout(resizeTimer)
      host.removeEventListener('contextmenu', onContextMenu)
      unsubOutput()
      unsubExit()
      resizeObserver?.disconnect()
      themeWatcher?.disconnect()
      if (termRef.current === term) termRef.current = null
      term?.dispose()
      if (sessionId !== null) void call('terminalKill', sessionId)
      sessionId = null
    }
  }, [repoPath, spawnNonce])

  return (
    <section
      className="terminal-panel"
      aria-label="Integrated terminal"
      {...(sessionId !== null ? { 'data-session': sessionId } : {})}
    >
      <header className="terminal-bar">
        <span className="terminal-title" title={repoPath}>
          {label} <span className="terminal-repo">— {repoName}</span>
        </span>
        {exitCode !== null && (
          <span className="terminal-exit">
            process exited with code {exitCode} —{' '}
            <button className="mini" onClick={() => setSpawnNonce(n => n + 1)}>
              Restart session
            </button>
          </span>
        )}
        {error !== null && <span className="terminal-error">{error}</span>}
        <span className="terminal-actions">
          <button
            className="mini"
            title="Clear the scrollback"
            onClick={() => termRef.current?.clear()}
          >
            Clear
          </button>
          <button
            className="mini"
            title="Start a new shell (the old one is ended)"
            onClick={() => setSpawnNonce(n => n + 1)}
          >
            Restart
          </button>
          <button
            className="mini"
            title="Close the terminal panel"
            onClick={() => store.toggleTerminal()}
          >
            Close
          </button>
        </span>
      </header>
      <div className="terminal-host" ref={hostRef} />
    </section>
  )
}
