import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { FilePreview } from '../../../shared/models'
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
import { buildSplitRows, isBinaryDiff, parseDiff } from '../diff-parse'
import { formatBytes } from '../format'
import { ModelPreview } from './ModelPreview'

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

const VIEW_KEY = 'aspen.diffView'

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
  preview,
  onRetry,
  onOpenFile
}: {
  diff: string | null
  title: string | null
  emptyTitle: string
  emptyHint: string
  /** Distinct from "nothing selected": fetching or rendering failed. */
  error?: string | null
  /** Media bytes when the selected file is an image/video/audio/model. */
  preview?: FilePreview | null
  onRetry?: () => void
  onOpenFile?: () => void
}): JSX.Element {
  const language = useMemo(() => languageFor(title), [title])
  const lines = useMemo(() => (diff !== null && diff !== '…' ? parseDiff(diff) : []), [diff])
  const [view, setView] = useState<DiffViewState>(readViewState)
  const [showAll, setShowAll] = useState(false)
  // An .obj, .gltf, .dae or ASCII .fbx is a model *and* readable text, so the
  // pane offers both and remembers which one was asked for.
  const [modelAsText, setModelAsText] = useState(false)

  useEffect(() => {
    setShowAll(false)
    setModelAsText(false)
  }, [diff, title])

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

  const isModel = preview?.kind === 'model'
  if (isBinaryDiff(diff)) {
    // Image/video/audio/model changes: show the file instead of announcing it
    // is binary (store.ts fills `preview` from the getPreview channel).
    if (preview !== undefined && preview !== null) {
      return <MediaPreview preview={preview} title={title} onOpenFile={onOpenFile} />
    }
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

  // A model whose diff is readable text (.obj, .gltf, .dae, ASCII .fbx) still
  // leads with the stage: a triangle soup is a poor way to review an asset.
  if (isModel === true && preview !== undefined && preview !== null && modelAsText === false) {
    return (
      <MediaPreview
        preview={preview}
        title={title}
        onOpenFile={onOpenFile}
        onShowText={() => setModelAsText(true)}
      />
    )
  }

  return (
    <div className={`diff-view${view.wrap ? '' : ' nowrap'}`}>
      {title !== null && (
        <div className="diff-title">
          <span className="diff-title-path">{title}</span>
          <span className="diff-title-actions">
            {isModel === true && (
              <button className="mini" onClick={() => setModelAsText(false)} title="Show the 3D model">
                3D view
              </button>
            )}
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

const KIND_LABELS: Record<FilePreview['kind'], string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  model: 'Model'
}

/**
 * The preview panel replacing the "Binary file" state for media files. The
 * bytes arrive from main (working tree or commit tree) as an ArrayBuffer and
 * are wrapped in a blob URL — revoked when the selection changes. Chromium's
 * own <video>/<audio> decoding decides playability; a codec it lacks (HEVC
 * .mov…) surfaces as the fallback note rather than a broken frame. 3D models
 * hand their bytes straight to the WebGL stage instead, with the sidecar files
 * main followed for them.
 */
function MediaPreview({
  preview,
  title,
  onOpenFile,
  onShowText
}: {
  preview: FilePreview
  title: string | null
  onOpenFile?: () => void
  /** Only for a model whose diff is readable text: switch to the line diff. */
  onShowText?: () => void
}): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setUrl(null)
    setFailed(false)
    // The model viewer reads the ArrayBuffer directly; a URL it cannot use
    // would only have to be revoked again.
    if (preview.data === undefined || preview.kind === 'model') return
    const objectUrl = URL.createObjectURL(new Blob([preview.data], { type: preview.mime }))
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [preview])

  return (
    <div className="diff-view media-preview-view">
      {title !== null && (
        <div className="diff-title">
          <span className="diff-title-path">{title}</span>
          <span className="diff-title-actions">
            {onShowText !== undefined && (
              <button className="mini" onClick={onShowText} title="Show the line diff instead">
                Text diff
              </button>
            )}
            {onOpenFile !== undefined && (
              <button className="mini" onClick={onOpenFile} title="Open in default program">
                Open
              </button>
            )}
          </span>
        </div>
      )}
      <div className="media-preview">
        {preview.data === undefined ? (
          <p className="muted">
            {KIND_LABELS[preview.kind]} is {formatBytes(preview.byteLength)} — too large to
            preview here.
          </p>
        ) : preview.kind === 'model' ? (
          <ModelPreview preview={preview} path={title} />
        ) : failed ? (
          <p className="muted">
            This {preview.kind} could not be played here — Aspen's viewer only ships the
            codecs Chromium itself has.
          </p>
        ) : url === null ? (
          <p className="muted">Loading preview…</p>
        ) : (
          <>
            {preview.kind === 'image' && (
              <img src={url} alt={title ?? 'Image preview'} onError={() => setFailed(true)} />
            )}
            {preview.kind === 'video' && (
              <video src={url} controls onError={() => setFailed(true)} />
            )}
            {preview.kind === 'audio' && (
              <audio src={url} controls onError={() => setFailed(true)} />
            )}
            <p className="media-caption muted">
              {KIND_LABELS[preview.kind]} · {formatBytes(preview.byteLength)}
            </p>
          </>
        )}
      </div>
    </div>
  )
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
