import { existsSync } from 'fs'
import { appendFile, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { IgnoreRequest } from '../../shared/models'

/**
 * `.gitignore` editing for the context-menu Ignore submenu: pure rule
 * construction (buildIgnoreRules) plus a deduplicating multi-rule writer
 * (appendGitignoreRules). Rules are always appended to the repository-root
 * `.gitignore`, like GitHub Desktop does.
 */

/**
 * Escapes the characters git's ignore format treats specially inside one
 * literal path segment: `[`, `]`, `*`, `?` as backslash escapes, plus a
 * leading `!`/`#` and trailing spaces (which git would otherwise read as
 * negation, comment or padding).
 */
export function escapeGitignoreSegment(segment: string): string {
  let out = segment.replace(/[[\]*?\\]/g, '\\$&')
  if (out.startsWith('!') || out.startsWith('#')) out = '\\' + out
  out = out.replace(/ +$/, '\\ ')
  return out
}

/** Repo-relative parent directory (no trailing slash); '' for root paths. */
function parentDir(path: string): string {
  const cleaned = path.replace(/^[/\\]+/, '')
  const cut = cleaned.lastIndexOf('/')
  return cut === -1 ? '' : cleaned.slice(0, cut)
}

/** Basename of a repo-relative path. */
function baseName(path: string): string {
  const cleaned = path.replace(/^[/\\]+/, '')
  return cleaned.slice(cleaned.lastIndexOf('/') + 1)
}

/**
 * The extension glob body for a path, or null when there is nothing to
 * glob: dot-files (`.env`, `.gitignore`) and extension-less names return
 * null so the UI hides the extension actions.
 */
export function extensionOf(path: string): string | null {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  return name.slice(dot + 1)
}

/** Join repo-relative segments with single forward slashes. */
function dirPath(...parts: string[]): string {
  return parts.filter(p => p.length > 0).join('/')
}

/** `<dir>/…/*.ext` with `depth` wildcard directory levels, cumulative. */
function extensionDepthRules(dir: string, ext: string, depth: number): string[] {
  const rules: string[] = []
  for (let level = 0; level < depth; level++) {
    const wildcards = Array<string>(level).fill('*').join('/')
    rules.push(dirPath(dir, wildcards, `*.${ext}`))
  }
  return rules
}

/** The rule text to append for an exact repository-relative path. */
export function gitignoreRuleFor(path: string, isDirectory: boolean): string {
  const parts = path
    .replace(/^[/\\]+/, '')
    .split('/')
    .filter(p => p.length > 0)
    .map(escapeGitignoreSegment)
  const rule = parts.join('/')
  return isDirectory ? `${rule}/` : rule
}

/**
 * Builds the `.gitignore` rules for one Ignore-request against a
 * repository-relative path. `isDirectory` describes the target itself
 * (only relevant for `mode: 'file'`). Pure and fs-free so it is unit
 * testable; `allUntracked` is expanded by the caller from the status.
 */
export function buildIgnoreRules(
  path: string,
  isDirectory: boolean,
  request: IgnoreRequest
): string[] {
  switch (request.mode) {
    case 'file':
      return [gitignoreRuleFor(path, isDirectory)]
    case 'name':
      return [escapeGitignoreSegment(baseName(path))]
    case 'extension': {
      const ext = extensionOf(path)
      return ext === null ? [] : [`*.${escapeGitignoreSegment(ext)}`]
    }
    case 'folder': {
      const dir = parentDir(path)
      return dir.length === 0
        ? []
        : [`${dirPath(...dir.split('/').map(escapeGitignoreSegment))}/`]
    }
    case 'folderDirect': {
      const dir = parentDir(path)
      return dir.length === 0
        ? []
        : [`${dirPath(...dir.split('/').map(escapeGitignoreSegment))}/*`]
    }
    case 'rootFolder': {
      const first = path.replace(/^[/\\]+/, '').split('/')[0]
      if (first === undefined || first.length === 0) return []
      return [`${escapeGitignoreSegment(first)}/`]
    }
    case 'extensionInFolder': {
      const ext = extensionOf(path)
      const dir = parentDir(path)
      if (ext === null || dir.length === 0) return []
      const dirEscaped = dirPath(...dir.split('/').map(escapeGitignoreSegment))
      if (request.depth === 'any') {
        return [`${dirEscaped}/**/*.${escapeGitignoreSegment(ext)}`]
      }
      return extensionDepthRules(dirEscaped, escapeGitignoreSegment(ext), request.depth)
    }
    case 'allUntracked':
      return []
  }
}

/** Convert an (already escaped) gitignore rule body into an anchored regex. */
function ruleBodyToRegExp(body: string): RegExp {
  let source = ''
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === '\\' && i + 1 < body.length) {
      source += body[i + 1]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      i += 2
      continue
    }
    if (ch === '*' && body[i + 1] === '*') {
      // `**` spans directory separators; a trailing `/**` also matches ''.
      source += '.*'
      i += 2
      if (body[i] === '/') {
        source += '(?:/.*)?'
        i++
      }
      continue
    }
    if (ch === '*') {
      source += '[^/]*'
      i++
      continue
    }
    if (ch === '?') {
      source += '[^/]'
      i++
      continue
    }
    source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    i++
  }
  return new RegExp(`^${source}$`)
}

/**
 * True when a repository-relative path is covered by one rule, using the
 * gitignore conventions that matter here: a rule without a directory part
 * matches at any depth (basename, or any directory segment for a subtree
 * effect — git never descends into a directory a pattern matched); an
 * anchored rule matches the path itself or any parent directory prefix, so
 * directory matches exclude the whole subtree.
 */
export function ruleMatchesPath(rule: string, path: string): boolean {
  const trailing = rule.endsWith('/')
  const body = trailing ? rule.slice(0, -1) : rule
  const re = ruleBodyToRegExp(body)
  const segments = path.split('/')
  if (body.includes('/')) {
    for (let k = segments.length; k >= 1; k--) {
      if (re.test(segments.slice(0, k).join('/'))) return true
    }
    return false
  }
  if (re.test(segments[segments.length - 1] ?? '')) return true
  return segments.slice(0, -1).some(seg => re.test(seg))
}

/**
 * Number of tracked status entries the appended rules cannot hide —
 * `.gitignore` only ever affects untracked files, and the UI reports this
 * honestly instead of pretending the folder disappeared.
 */
export function trackedInScopeOf(
  rules: ReadonlyArray<string>,
  trackedPaths: ReadonlyArray<string>
): number {
  return trackedPaths.filter(p => rules.some(r => ruleMatchesPath(r, p))).length
}

/**
 * Appends rules to `<repoPath>/.gitignore`, creating the file when missing.
 * Already-present rules (verbatim, after trimming) are skipped. One read and
 * one append pass regardless of rule count. Returns the rules actually
 * written.
 */
export async function appendGitignoreRules(
  repoPath: string,
  rules: ReadonlyArray<string>
): Promise<string[]> {
  const pending = [...new Set(rules.map(r => r.trim()).filter(r => r.length > 0))]
  if (pending.length === 0) return []
  const file = join(repoPath, '.gitignore')
  const existing = existsSync(file) ? await readFile(file, 'utf8') : ''
  const lines = new Set(existing.split(/\r?\n/).map(l => l.trim()))
  const missing = pending.filter(r => !lines.has(r))
  if (missing.length === 0) return []

  if (existing.length === 0) {
    await writeFile(file, `${missing.join('\n')}\n`, 'utf8')
    return missing
  }
  const separator = existing.endsWith('\n') ? '' : '\n'
  await appendFile(file, `${separator}${missing.join('\n')}\n`, 'utf8')
  return missing
}
