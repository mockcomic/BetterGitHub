import { resolve, sep } from 'path'

/**
 * Resolves a repository-relative path (forward slashes, as git reports them)
 * against the repository root and refuses anything that escapes it — the one
 * containment check shared by every main-process entry point that touches the
 * working tree by renderer-supplied path (IPC shell helpers, synthesized
 * untracked diffs). A renderer bug or a hostile payload with `..` segments can
 * then never make the app read, reveal or delete outside the repository folder.
 */
export function safeJoin(repoPath: string, path: string): string {
  const root = resolve(repoPath)
  const target = resolve(root, ...path.split('/').filter(p => p.length > 0))
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Refusing to touch a path outside the repository: ${path}`)
  }
  return target
}
