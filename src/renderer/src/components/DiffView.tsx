import type { JSX } from 'react'
import { useMemo } from 'react'
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
import { parseDiff } from '../diff-parse'

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

function languageFor(path: string | null): string | null {
  if (path === null) return null
  const dot = path.lastIndexOf('.')
  if (dot === -1) return null
  return EXT_LANGUAGES.get(path.slice(dot + 1).toLowerCase()) ?? null
}

function highlight(line: DiffLine, language: string | null): string {
  if (line.kind === 'add' || line.kind === 'del' || line.kind === 'ctx') {
    if (language !== null && Prism.languages[language] !== undefined) {
      try {
        return Prism.highlight(
          escapeHtml(line.text),
          Prism.languages[language],
          language
        )
      } catch {
        /* fall through */
      }
    }
  }
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
  emptyHint
}: {
  diff: string | null
  title: string | null
  emptyTitle: string
  emptyHint: string
}): JSX.Element {
  const language = useMemo(() => languageFor(title), [title])
  const lines = useMemo(() => (diff !== null ? parseDiff(diff) : []), [diff])

  if (diff === '…') {
    return <div className="diff-view empty-diff">Loading diff…</div>
  }

  if (diff === null || diff.trim().length === 0) {
    return (
      <div className="diff-view empty-diff">
        <h2>{emptyTitle}</h2>
        <p>{emptyHint}</p>
      </div>
    )
  }

  return (
    <div className="diff-view">
      {title !== null && <div className="diff-title">{title}</div>}
      <table className="diff-table">
        <tbody>
          {lines.map((line, i) => (
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
    </div>
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
