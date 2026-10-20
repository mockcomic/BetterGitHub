export type DiffLineKind =
  | 'meta'
  | 'hunk'
  | 'add'
  | 'del'
  | 'ctx'
  | 'warning'

export interface DiffLine {
  readonly kind: DiffLineKind
  readonly text: string
  readonly oldNo: number | null
  readonly newNo: number | null
}

/**
 * Parse unified diff text into renderable lines with old/new line numbers.
 */
export function parseDiff(text: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  let binary = false

  for (const raw of text.split('\n')) {
    if (raw.length === 0) {
      // A trailing empty line from the split; keep as context if inside a hunk.
      continue
    }

    if (raw.startsWith('@@')) {
      const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m !== null) {
        oldNo = parseInt(m[1], 10) - 1
        newNo = parseInt(m[2], 10) - 1
      }
      lines.push({ kind: 'hunk', text: raw, oldNo: null, newNo: null })
      continue
    }

    if (
      raw.startsWith('diff --git') ||
      raw.startsWith('index ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ') ||
      raw.startsWith('new file') ||
      raw.startsWith('deleted file') ||
      raw.startsWith('similarity ') ||
      raw.startsWith('rename ') ||
      raw.startsWith('copy ') ||
      raw.startsWith('mode ')
    ) {
      lines.push({ kind: 'meta', text: raw, oldNo: null, newNo: null })
      continue
    }

    if (raw.startsWith('Binary files')) {
      binary = true
      lines.push({ kind: 'warning', text: raw, oldNo: null, newNo: null })
      continue
    }

    if (raw.startsWith('\\')) {
      lines.push({ kind: 'warning', text: raw, oldNo: null, newNo: null })
      continue
    }

    if (raw.startsWith('+')) {
      newNo += 1
      lines.push({ kind: 'add', text: raw.slice(1), oldNo: null, newNo })
    } else if (raw.startsWith('-')) {
      oldNo += 1
      lines.push({ kind: 'del', text: raw.slice(1), oldNo, newNo: null })
    } else {
      oldNo += 1
      newNo += 1
      lines.push({
        kind: 'ctx',
        text: raw.startsWith(' ') ? raw.slice(1) : raw,
        oldNo,
        newNo
      })
    }
  }

  if (binary && lines.length > 0) {
    return lines.filter(l => l.kind === 'warning' || l.kind === 'meta')
  }

  return lines
}

export function isBinaryDiff(text: string): boolean {
  return text.includes('Binary files') || text.includes('GIT binary patch')
}
