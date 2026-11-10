import type { JSX } from 'react'
import type { ITerminalOptions, Terminal as XtermTerminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { call, onTerminalExit, onTerminalOutput } from '../api'
import {
  closeTab,
  emptyStrip,
  openTab,
  selectTab,
  type TabStrip
} from '../terminal-tabs'

/**
 * The integrated terminal panel: a strip of tabs, each one a docked xterm.js
 * surface bound to its own PTY session in main (src/main/terminal.ts + the
 * channels in src/shared/ipc.ts). Everything here is component-local on
 * purpose — the store only knows whether the panel is open; keystrokes, PTY
 * output and which tab is in front never travel through the git state.
 *
 * Lifecycle: the panel opens with exactly one shell; `+` spawns another and
 * × ends that one (its view unmounting is what kills the session, never a
 * leftover shell). Closing the last tab undocks the panel, and a repository
 * switch remounts the whole thing (App.tsx keys the panel by repo), so every
 * session of the old folder dies with it.
 *
 * The strip rules themselves live in src/renderer/src/terminal-tabs.ts — pure
 * data, unit-tested there, so this file is only wiring.
 */
interface TerminalPanelProps {
  readonly repoPath: string
  readonly repoName: string
}

/**
 * The terminal's own font stack — deliberately *not* the app's `--mono`.
 *
 * A prompt theme (oh-my-posh and friends) draws its segment separators and
 * icons from the Unicode private-use area ( — U+E0B0, — U+E0A0,
 * — U+F044, …), and neither Cascadia Code nor Consolas carries a single one
 * of those, so a Cascadia-first stack renders the whole prompt as tofu boxes
 * no matter what the shell sends. The Nerd Font families lead and xterm falls
 * back glyph by glyph; the `Mono` spellings come before the others because
 * their icons are single-width, which is what a cell grid needs. The plain
 * families and the generic tail keep this working on a machine that has none
 * of them installed.
 */
const TERMINAL_FONT = [
  "'MesloLGS Nerd Font Mono'",
  "'Meslo LG S Nerd Font Mono'",
  "'JetBrainsMono Nerd Font Mono'",
  "'JetBrainsMono Nerd Font'",
  "'FiraCode Nerd Font Mono'",
  "'Hack Nerd Font Mono'",
  "'Cascadia Code'",
  "'Cascadia Mono'",
  "'Consolas'",
  "'SFMono-Regular'",
  'Menlo',
  'monospace'
].join(', ')

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

/** What a view tells the strip about its session, and nothing else. */
interface TabInfo {
  readonly label: string
  /** Mirrored to the panel's data-session for the QA probes. */
  readonly sessionId: string | null
  readonly exitCode: number | null
  readonly error: string | null
}

const initialInfo: TabInfo = {
  label: 'Terminal',
  sessionId: null,
  exitCode: null,
  error: null
}

/** The bar's buttons, reaching the live terminal of one tab. */
interface TerminalViewApi {
  readonly clear: () => void
  readonly restart: () => void
}

export function TerminalPanel({ repoPath, repoName }: TerminalPanelProps): JSX.Element {
  const store = useStore()
  /** One tab from the first render: the panel always opens with a shell. */
  const [strip, setStrip] = useState<TabStrip>(() => openTab(emptyStrip).strip)
  const [infos, setInfos] = useState<Readonly<Record<number, TabInfo>>>({})
  /** The views' handles, keyed by tab id; a ref so the buttons never go
   *  stale between the spawn and the next render. */
  const apis = useRef(new Map<number, TerminalViewApi>()).current

  const reportInfo = useCallback((id: number, patch: Partial<TabInfo>): void => {
    setInfos(prev => ({ ...prev, [id]: { ...(prev[id] ?? initialInfo), ...patch } }))
  }, [])

  const active = strip.activeId === null ? null : strip.tabs.find(tab => tab.id === strip.activeId) ?? null
  const activeInfo = active === null ? null : (infos[active.id] ?? initialInfo)
  /** Looked up at click time, not render time — the view registers its
   *  handle some time after this markup exists. */
  const apiOfActive = (): TerminalViewApi | null =>
    strip.activeId === null ? null : apis.get(strip.activeId) ?? null

  // The last tab closed: undock the panel. App.tsx only mounts this component
  // while the panel is open, so toggling here can only mean closing, and the
  // unmount is the teardown that would have killed the sessions anyway.
  useEffect(() => {
    if (strip.tabs.length === 0) store.toggleTerminal()
  }, [strip, store])

  const tabTitle = (id: number): string => (infos[id] ?? initialInfo).label

  return (
    <section
      className="terminal-panel"
      aria-label="Integrated terminal"
      {...(activeInfo?.sessionId !== null && activeInfo !== null
        ? { 'data-session': activeInfo.sessionId }
        : {})}
    >
      <header className="terminal-bar">
        <span className="terminal-tabs" role="tablist" aria-label="Terminal sessions">
          {strip.tabs.map((tab, index) => {
            const isActive = tab.id === strip.activeId
            return (
              <span
                key={tab.id}
                className={isActive ? 'terminal-tab active' : 'terminal-tab'}
                role="tab"
                aria-selected={isActive}
              >
                <button
                  className="terminal-tab-label"
                  type="button"
                  title={repoPath}
                  onClick={() => setStrip(current => selectTab(current, tab.id))}
                >
                  {tabTitle(tab.id)}
                  <span className="terminal-tab-index">{index + 1}</span>
                </button>
                <button
                  className="terminal-tab-close"
                  type="button"
                  aria-label={`Close ${tabTitle(tab.id)} session`}
                  title="Close this terminal"
                  onClick={() => setStrip(current => closeTab(current, tab.id).strip)}
                >
                  ×
                </button>
              </span>
            )
          })}
          <button
            className="terminal-new"
            type="button"
            title="New terminal"
            aria-label="New terminal"
            onClick={() => setStrip(current => openTab(current).strip)}
          >
            +
          </button>
        </span>
        <span className="terminal-repo">{repoName}</span>
        {activeInfo !== null && activeInfo.exitCode !== null && (
          <span className="terminal-exit">
            process exited with code {activeInfo.exitCode} —{' '}
            <button className="mini" onClick={() => apiOfActive()?.restart()}>
              Restart session
            </button>
          </span>
        )}
        {activeInfo !== null && activeInfo.error !== null && (
          <span className="terminal-error">{activeInfo.error}</span>
        )}
        <span className="terminal-actions">
          <button
            className="mini"
            title="Clear the scrollback"
            onClick={() => apiOfActive()?.clear()}
          >
            Clear
          </button>
          <button
            className="mini"
            title="Start a new shell for this tab (the old one is ended)"
            onClick={() => apiOfActive()?.restart()}
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
      <div className="terminal-body">
        {strip.tabs.map(tab => (
          <TerminalView
            key={tab.id}
            repoPath={repoPath}
            active={tab.id === strip.activeId}
            tabId={tab.id}
            onInfo={patch => reportInfo(tab.id, patch)}
            onApi={api => {
              if (api === null) apis.delete(tab.id)
              else apis.set(tab.id, api)
            }}
          />
        ))}
      </div>
    </section>
  )
}

interface TerminalViewProps {
  readonly repoPath: string
  readonly tabId: number
  readonly active: boolean
  readonly onInfo: (patch: Partial<TabInfo>) => void
  readonly onApi: (api: TerminalViewApi | null) => void
}

/**
 * One tab: the xterm instance, its session, and the resize/theme plumbing that
 * keeps them honest. Inactive tabs stay mounted (hidden with CSS) so switching
 * back is instant and the shell never notices; the ResizeObserver that is
 * already watching the host refits it when it becomes visible again.
 */
function TerminalView({
  repoPath,
  tabId,
  active,
  onInfo,
  onApi
}: TerminalViewProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<XtermTerminal | null>(null)
  /** Latest-callback refs: the spawn effect below must not restart because an
   *  inline arrow in the parent changed identity. */
  const infoRef = useRef(onInfo)
  const apiRef = useRef(onApi)
  infoRef.current = onInfo
  apiRef.current = onApi
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
    infoRef.current({ ...initialInfo })

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
          // Suppress the browser's own paste too. xterm attaches a `paste`
          // listener to its hidden textarea and to the terminal element
          // (@xterm/xterm src/browser/Terminal.ts:342-344), so an unprevented
          // Ctrl+V lets Chromium paste into the textarea AND this read-back
          // paste run — the text reached the PTY twice (verified against a
          // real keydown in Electron 44 + xterm 5.5: one keydown produced two
          // identical onData writes). Pasting from here only keeps the one
          // spelling working on every platform.
          e.preventDefault()
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
      apiRef.current({
        clear: () => terminal.clear(),
        restart: () => setSpawnNonce(n => n + 1)
      })
      try {
        fit.fit()
      } catch {
        /* a zero-size host (mid-animation, or a background tab) just falls
           back below */
      }
      const dims = fit.proposeDimensions() ?? { cols: 80, rows: 24 }

      try {
        const info = await call('terminalStart', repoPath, dims.cols, dims.rows)
        if (disposed) {
          void call('terminalKill', info.id)
          return
        }
        sessionId = info.id
        infoRef.current({ label: info.shellLabel, sessionId: info.id })
        terminal.focus()
        // The input leg of the round trip: everything xterm encodes from a
        // keystroke (printables, Enter, arrows, paste, IME commits) leaves
        // the renderer on this one line. Without it the PTY never hears the
        // keyboard — the push channel alone only carries output back.
        terminal.onData(data => {
          if (sessionId !== null) void call('terminalWrite', sessionId, data)
        })
        unsubOutput = onTerminalOutput((id, data) => {
          if (id === sessionId) terminal.write(data)
        })
        unsubExit = onTerminalExit((id, code) => {
          if (id === sessionId) {
            sessionId = null
            infoRef.current({ exitCode: code, sessionId: null })
          }
        })
      } catch (err) {
        infoRef.current({
          error: err instanceof Error ? err.message : String(err),
          sessionId: null
        })
        return
      }

      const refit = (): void => {
        if (sessionId === null) return
        // A hidden host measures 0×0; fitting that would hand the PTY a
        // one-cell grid for a shell that is merely in another tab.
        if (host.offsetParent === null) return
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
      // Returning to the foreground is a size change too, which is how a
      // background tab catches up on a resized panel.
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
      apiRef.current(null)
      term?.dispose()
      if (sessionId !== null) void call('terminalKill', sessionId)
      sessionId = null
    }
  }, [repoPath, spawnNonce])

  // Clicking a tab should put the caret in it, the way every terminal does.
  useEffect(() => {
    if (active) termRef.current?.focus()
  }, [active])

  return (
    <div
      className={active ? 'terminal-host' : 'terminal-host terminal-host-hidden'}
      ref={hostRef}
      data-terminal-tab={tabId}
    />
  )
}
