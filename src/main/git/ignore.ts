import { existsSync } from 'fs'
import { appendFile, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

/**
 * `.gitignore` editing for the "Ignore file" context-menu action.
 */

/** The rule text to append for a repository-relative path. */
export function gitignoreRuleFor(path: string, isDirectory: boolean): string {
  const cleaned = path.replace(/^[/\\]+/, '')
  return isDirectory ? `${cleaned}/` : cleaned
}

/**
 * Appends a rule to `<repoPath>/.gitignore`, creating the file when missing.
 * Returns false (no write) when the rule is already present verbatim.
 */
export async function appendGitignoreRule(
  repoPath: string,
  rule: string
): Promise<boolean> {
  const file = join(repoPath, '.gitignore')
  const existing = existsSync(file) ? await readFile(file, 'utf8') : ''
  const lines = existing.split(/\r?\n/).map(l => l.trim())
  if (lines.includes(rule)) return false

  if (existing.length === 0) {
    await writeFile(file, `${rule}\n`, 'utf8')
    return true
  }
  const separator = existing.endsWith('\n') ? '' : '\n'
  await appendFile(file, `${separator}${rule}\n`, 'utf8')
  return true
}
