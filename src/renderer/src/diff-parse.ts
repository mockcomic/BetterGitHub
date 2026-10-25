export type DiffLineKind =
  | 'meta'
  | 'hunk'
  | 'add'
  | 'del'
  | 'ctx'
  | 'warning'

/** A run of characters inside a changed line, marked when it actually differs. */
export interface DiffSegment {
  readonly text: string
  readonly changed: boolean
}

export interface DiffLine {
  readonly kind: DiffLineKind
  readonly text: string
  readonly oldNo: number | null
  readonly newNo: number | null
  /**
   * Present on paired add/del lines: the same text split into unchanged and
   * changed runs (GitHub Desktop's word-level diff highlighting).
   */
  readonly segments?: ReadonlyArray<DiffSegment>
}

interface MutableDiffLine extends DiffLine {
  segments?: ReadonlyArray<DiffSegment>
}

/**
 * Parse unified diff text into renderable lines with old/new line numbers,
 * then annotate paired changes with character-level "what really moved".
 */
export function parseDiff(text: string): DiffLine[] {
  const lines: MutableDiffLine[] = []
  let oldNo = 0
  let newNo = 0
  let binary = false

  // Track whether we are inside a hunk: only OUTSIDE a hunk may a `--- `/
  // `+++ ` line be a file header. Inside a hunk those prefixes are content
  // (a deleted `--- foo` line arrives raw as `---- foo`? no — as `--- foo`
  // when the removed line itself begins with `-- `), and misreading them as
  // meta skips the line-number counters and shifts every later line.
  // A new `diff --git` header ends the previous hunk: multi-file diffs must
  // not parse the next file's `--- a/x` / `+++ b/x` header as -/+ content
  // (that would paint header lines as changes and shift every line number).
  let inHunk = false
  for (const raw of text.split('\n')) {
    if (raw.length === 0) {
      // git never emits a truly empty body line (empty context is " "), so
      // this is only the trailing piece from the split; keep dropping it.
      continue
    }

    if (raw.startsWith('diff --git')) {
      inHunk = false
      lines.push({ kind: 'meta', text: raw, oldNo: null, newNo: null })
      continue
    }

    if (raw.startsWith('@@')) {      const m =
        raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/) ??
        // Combined diff (merge commits) headers: @@@ -1,2 -1,2 +1,3 @@@
        raw.match(/^@@@+ -\d+(?:,\d+)? -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@@+/)
      if (m !== null) {
        oldNo = 0
        newNo = parseInt(m[1] ?? m[2], 10) - 1
        if (m[1] === undefined) {
          const mm = raw.match(/^-\d+/)
          oldNo = mm ? parseInt(mm[0].slice(1), 10) - 1 : 0
        }
      } else {
        // Unparseable header: reset counters rather than continue stale ones.
        oldNo = 0
        newNo = 0
      }
      inHunk = true
      lines.push({ kind: 'hunk', text: raw, oldNo: null, newNo: null })
      continue
    }

    if (
      !inHunk &&
      (raw.startsWith('index ') ||
        raw.startsWith('--- ') ||
        raw.startsWith('+++ ') ||
        raw.startsWith('new file') ||
        raw.startsWith('deleted file') ||
        raw.startsWith('similarity ') ||
        raw.startsWith('rename ') ||
        raw.startsWith('copy ') ||
        raw.startsWith('mode '))
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

  annotateWordDiff(lines)
  return lines
}

/**
 * Walks the parsed lines and, for each run of deletions immediately followed
 * by a run of additions, pairs them up index-wise and records the character
 * runs that differ. Lines beyond a token budget are left unannotated (the LCS
 * is quadratic) — they still render normally.
 */
export function annotateWordDiff(lines: MutableDiffLine[]): void {
  let i = 0
  while (i < lines.length) {
    if (lines[i].kind !== 'del') {
      i++
      continue
    }
    let delEnd = i
    while (delEnd < lines.length && lines[delEnd].kind === 'del') delEnd++
    let addEnd = delEnd
    while (addEnd < lines.length && lines[addEnd].kind === 'add') addEnd++

    const dels = lines.slice(i, delEnd)
    const adds = lines.slice(delEnd, addEnd)
    const pairs = Math.min(dels.length, adds.length)
    for (let p = 0; p < pairs; p++) {
      const left = dels[p].text
      const right = adds[p].text
      if (
        left.length > MAX_WORD_DIFF_CHARS ||
        right.length > MAX_WORD_DIFF_CHARS
      ) {
        continue
      }
      const parts = charDiff(left, right)
      dels[p].segments = parts
        .filter(part => !part.inserted)
        .map(part => ({ text: part.text, changed: part.changed }))
      adds[p].segments = parts
        .filter(part => !part.deleted)
        .map(part => ({ text: part.text, changed: part.changed }))
    }
    i = addEnd > i ? addEnd : i + 1
  }
}

const MAX_WORD_DIFF_CHARS = 2000

interface CharPart {
  readonly text: string
  readonly changed: boolean
  readonly deleted: boolean
  readonly inserted: boolean
}

/** Tokenizes into words / runs of spaces / single punctuation marks. */
export function tokenizeForDiff(text: string): string[] {
  return text.match(/\s+|\w+|[^\s\w]/g) ?? []
}

/** Classic LCS diff over tokens, with equal runs merged. */
export function charDiff(a: string, b: string): CharPart[] {
  const left = tokenizeForDiff(a)
  const right = tokenizeForDiff(b)
  const n = left.length
  const m = right.length

  // Longest-common-subsequence table (rows of n+1 x m+1).
  const table: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        left[i] === right[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const parts: CharPart[] = []
  const push = (
    text: string,
    changed: boolean,
    deleted: boolean,
    inserted: boolean
  ): void => {
    const last = parts[parts.length - 1]
    if (
      last !== undefined &&
      last.changed === changed &&
      last.deleted === deleted &&
      last.inserted === inserted
    ) {
      parts[parts.length - 1] = { text: last.text + text, changed, deleted, inserted }
    } else {
      parts.push({ text, changed, deleted, inserted })
    }
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      push(left[i], false, false, false)
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push(left[i], true, true, false)
      i++
    } else {
      push(right[j], true, false, true)
      j++
    }
  }
  while (i < n) {
    push(left[i], true, true, false)
    i++
  }
  while (j < m) {
    push(right[j], true, false, true)
    j++
  }
  return parts
}

export function isBinaryDiff(text: string): boolean {
  return text.includes('Binary files') || text.includes('GIT binary patch')
}
