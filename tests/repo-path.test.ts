import { describe, expect, it } from 'vitest'
import { resolve } from 'path'
import { safeJoin } from '../src/main/git/repo-path'

describe('safeJoin', () => {
  const root = resolve('repo-root')

  it('resolves plain repository-relative paths', () => {
    expect(safeJoin(root, 'src/app.ts')).toBe(resolve(root, 'src', 'app.ts'))
  })

  it('allows nesting but refuses traversal out of the repository', () => {
    // Staying inside via .. is fine…
    expect(safeJoin(root, 'a/../b/c.txt')).toBe(resolve(root, 'b', 'c.txt'))
    // …but escaping the root is refused.
    expect(() => safeJoin(root, '../outside.txt')).toThrow(/outside the repository/)
    expect(() => safeJoin(root, 'a/../../outside.txt')).toThrow(
      /outside the repository/
    )
    expect(() => safeJoin(root, '../../deep/secret')).toThrow(
      /outside the repository/
    )
  })

  it('treats a leading-slash payload as repository-relative, never an escape', () => {
    // Splitting on '/' drops the leading slash, so `/etc/passwd` lands
    // *inside* the repo — it cannot break out to the real absolute path.
    expect(safeJoin(root, '/etc/passwd')).toBe(resolve(root, 'etc', 'passwd'))
  })

  it('returns the repository root itself for an empty path', () => {
    expect(safeJoin(root, '')).toBe(root)
    expect(safeJoin(root, '/')).toBe(root)
  })
})
