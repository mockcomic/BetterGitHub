import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-ini'
import 'prismjs/components/prism-toml'
import type { DiffLine } from '../diff-parse'
import { isBinaryDiff, parseDiff } from '../diff-parse'

const EXT_LANGUAGES = new Map<string, string>([
  ['ts', 'typescript'],
  ['tsx', 'tsx'],
  ['js', 'javascript'],
  ['jsx', 'jsx'],
  ['mjs', 'javascript'],
  ['cjs', 'javascript'],
  ['json', 'json'],
  ['css', 'css'],
  ['scss', 'scss'],
  ['py', 'python'],
  ['sh', 'bash'],
  ['bash', 'bash'],
  ['yml', 'yaml'],
  ['yaml', 'yaml'],
  ['md', 'markdown'],
  ['go', 'go'],
  ['rs', 'rust'],
  ['java', 'java'],
  ['c', 'c'],
  ['h', 'c'],
  ['cpp', 'cpp'],
  ['hpp', 'cpp'],
  ['cs', 'csharp'],
  ['ini', 'ini'],
  ['toml', 'toml']
])

/** Lines rendered before the "show all" guard kicks in. */
const RENDER_LIMIT = 3000

const VIEW_KEY = 'gitdesk.diffView'

interface DiffViewState {
  readonly split: boolean
  readonly wrap: boolean
}

function readViewState(): DiffViewState {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw === null) return { split: false, wrap: true }
    const parsed = JSON.parse(raw) as Partial<DiffViewState>
    return {
      split: parsed.split === true,
      wrap: parsed.wrap !== false
    }
  } catch {
    return { split: false, wrap: true }
  }
}

function languageFor(path: string | null): string | null {
  if (path === null) return null
  const dot = path.lastIndexOf('.')
  if (dot === -1) return null
  return EXT_LANGUAGES.get(path.slice(dot + 1).toLowerCase()) ?? null
}

function highlightText(text: string, language: string | null): string {
  if (language !== null && Prism.languages[language] !== undefined) {
    try {
      // Prism escapes internally; pre-escaping here double-escapes and the
      // user sees literal `&lt;`/`&amp;` garbage in every highlighted line.
      return Prism.highlight(text, Prism.languages[language], language)
    } catch {
      /* fall through */
    }
  }
  return escapeHtml(text)
}

function highlight(line: DiffLine, language: string | null): string {
  const highlightable =
    line.kind === 'add' || line.kind === 'del' || line.kind === 'ctx'
  if (line.segments !== undefined && line.segments.length > 0) {
    // Word-level highlighting wins over token colours on changed lines.
    return line.segments
      .map(s => {
        const html = highlightText(s.text, highlightable ? language : null)
        return s.changed
          ? `<span class="word-${line.kind === 'add' ? 'ins' : 'del'}">${html}</span>`
          : html
      })
      .join('')
  }
  if (highlightable) return highlightText(line.text, language)
  return escapeHtml(line.text)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function DiffView({
  diff,
  title,
  emptyTitle,
  emptyHint,
  error,
  onRetry,
  onOpenFile
}: {
  diff: string | null
  title: string | null
  emptyTitle: string
  emptyHint: string
  /** Distinct from "nothing selected": fetching or rendering failed. */
  error?: string | null
  onRetry?: () => void
  onOpenFile?: () => void
}): JSX.Element {
  const language = useMemo(() => languageFor(title), [title])
  const lines = useMemo(() => (diff !== null && diff !== '…' ? parseDiff(diff) : []), [diff])
  const [view, setView] = useState<DiffViewState>(readViewState)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setShowAll(false)
  }, [diff])

  if (diff === '…') {
    return <div className="diff-view empty-diff">Loading diff…</div>
  }

  if (error !== undefined && error !== null) {
    return (
      <div className="diff-view empty-diff">
        <h2>This diff could not be read</h2>
        <p className="diff-error">{error}</p>
        {onRetry !== undefined && (
          <p>
            <button className="btn" onClick={onRetry}>
              Try again
            </button>
          </p>
        )}
      </div>
    )
  }

  if (diff === null || diff.trim().length === 0) {
    return (
      <div className="diff-view empty-diff">
        <h2>{emptyTitle}</h2>
        <p>{emptyHint}</p>
      </div>
    )
  }

  if (isBinaryDiff(diff)) {
    return (
      <div className="diff-view empty-diff">
        <h2>Binary file</h2>
        <p>{title}</p>
        <p className="muted">Git reports this as a binary change, so there is no text diff to show.</p>
      </div>
    )
  }

  const truncated = !showAll && lines.length > RENDER_LIMIT
  const visible = truncated ? lines.slice(0, RENDER_LIMIT) : lines

  return (
    <div className={`diff-view${view.wrap ? '' : ' nowrap'}`}>
      {title !== null && (
        <div className="diff-title">
          <span className="diff-title-path">{title}</span>
          <span className="diff-title-actions">
            <button
              className="mini"
              title="Show changes side by side"
              onClick={() => updateView(setView, view, { split: !view.split })}
            >
              {view.split ? 'Unified' : 'Split'}
            </button>
            <button
              className="mini"
              title="Wrap long lines"
              onClick={() => updateView(setView, view, { wrap: !view.wrap })}
            >
              {view.wrap ? 'No wrap' : 'Wrap'}
            </button>
            {onOpenFile !== undefined && (
              <button className="mini" onClick={onOpenFile} title="Open in default program">
                Open
              </button>
            )}
          </span>
        </div>
      )}
      {view.split ? (
        <SplitTable lines={visible} language={language} />
      ) : (
        <table className="diff-table">
          <tbody>
            {visible.map((line, i) => (
              <tr key={i} className={`diff-line ${line.kind}`}>
                <td className="lineno">{line.oldNo ?? ''}</td>
                <td className="lineno">{line.newNo ?? ''}</td>
                <td className="sign">{signFor(line.kind)}</td>
                <td
                  className="content"
                  dangerouslySetInnerHTML={{ __html: highlight(line, language) }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {truncated && (
        <div className="diff-truncated">
          Showing {RENDER_LIMIT} of {lines.length} lines —{' '}
          <button className="mini" onClick={() => setShowAll(true)}>
            Show all
          </button>
        </div>
      )}
    </div>
  )
}

function updateView(
  setter: (v: DiffViewState) => void,
  current: DiffViewState,
  patch: Partial<DiffViewState>
): void {
  const next = { ...current, ...patch }
  setter(next)
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

interface SplitRow {
  readonly hunk?: string
  readonly left?: DiffLine
  readonly right?: DiffLine
}

/** Aligns a deletion run with the addition run that follows it, row by row. */
export function buildSplitRows(lines: ReadonlyArray<DiffLine>): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.kind === 'hunk') {
      rows.push({ hunk: line.text })
      i++
      continue
    }
    if (line.kind === 'meta' || line.kind === 'warning') {
      rows.push({ hunk: line.text })
      i++
      continue
    }
    if (line.kind === 'ctx') {
      rows.push({ left: line, right: line })
      i++
      continue
    }
    // A del run, optionally followed by an add run.
    let delEnd = i
    while (delEnd < lines.length && lines[delEnd].kind === 'del') delEnd++
    let addEnd = delEnd
    while (addEnd < lines.length && lines[addEnd].kind === 'add') addEnd++
    const dels = lines.slice(i, delEnd)
    const adds = lines.slice(delEnd, addEnd)
    const count = Math.max(dels.length, adds.length)
    for (let p = 0; p < count; p++) {
      rows.push({ left: dels[p], right: adds[p] })
    }
    i = addEnd > i ? addEnd : i + 1
  }
  return rows
}

function SplitTable({
  lines,
  language
}: {
  lines: ReadonlyArray<DiffLine>
  language: string | null
}): JSX.Element {
  const rows = useMemo(() => buildSplitRows(lines), [lines])
  return (
    <table className="diff-table split">
      <tbody>
        {rows.map((row, i) =>
          row.hunk !== undefined ? (
            <tr key={i} className="diff-line hunk">
              <td className="lineno" />
              <td className="sign">@</td>
              <td className="content" colSpan={4}>
                {escapeHtml(row.hunk)}
              </td>
            </tr>
          ) : (
            <tr key={i} className="diff-line split-row">
              <td className="lineno">{row.left?.oldNo ?? ''}</td>
              <td
                className={`content side left${
                  row.left !== undefined ? ` ${row.left.kind}` : ' empty'
                }`}
                dangerouslySetInnerHTML={{
                  __html: row.left !== undefined ? highlight(row.left, language) : ''
                }}
              />
              <td className="lineno">{row.right?.newNo ?? ''}</td>
              <td
                className={`content side right${
                  row.right !== undefined ? ` ${row.right.kind}` : ' empty'
                }`}
                dangerouslySetInnerHTML={{
                  __html: row.right !== undefined ? highlight(row.right, language) : ''
                }}
              />
            </tr>
          )
        )}
      </tbody>
    </table>
  )
}

function signFor(kind: DiffLine['kind']): string {
  switch (kind) {
    case 'add':
      return '+'
    case 'del':
      return '-'
    case 'hunk':
      return '@'
    default:
      return ''
  }
}
