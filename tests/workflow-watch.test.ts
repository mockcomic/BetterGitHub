import { describe, expect, it } from 'vitest'
import { detectWorkflows } from '../src/main/git/status'
import { shouldIgnore } from '../src/main/watch-filter'

describe('detectWorkflows', () => {
  it('reports an idle worktree', () => {
    expect(detectWorkflows(new Set())).toEqual({
      merge: false,
      rebase: false,
      cherryPick: false,
      revert: false
    })
  })

  it('detects a paused merge', () => {
    expect(detectWorkflows(new Set(['MERGE_HEAD'])).merge).toBe(true)
  })

  it('detects a rebase from either directory form', () => {
    expect(detectWorkflows(new Set(['rebase-merge'])).rebase).toBe(true)
    expect(detectWorkflows(new Set(['rebase-apply'])).rebase).toBe(true)
  })

  it('keeps revert and cherry-pick apart even though both set CHERRY_PICK_HEAD', () => {
    const revert = detectWorkflows(new Set(['CHERRY_PICK_HEAD', 'REVERT_HEAD']))
    expect(revert).toMatchObject({ revert: true, cherryPick: false })

    const pick = detectWorkflows(new Set(['CHERRY_PICK_HEAD']))
    expect(pick).toMatchObject({ revert: false, cherryPick: true })
  })
})

describe('shouldIgnore', () => {
  const repo = 'C:/repos/demo'

  it('ignores nothing in the normal working tree', () => {
    expect(shouldIgnore(repo, 'src/main/ipc.ts')).toBe(false)
    expect(shouldIgnore(repo, 'README.md')).toBe(false)
    expect(shouldIgnore(repo, 'docs/a/b/c.md')).toBe(false)
  })

  it('ignores noisy git internals', () => {
    expect(shouldIgnore(repo, '.git/logs/HEAD')).toBe(true)
    expect(shouldIgnore(repo, '.git/objects/ab/cdef01')).toBe(true)
    expect(shouldIgnore(repo, '.git/COMMIT_EDITMSG')).toBe(true)
  })

  it('reacts to bookkeeping files that change what the UI shows', () => {
    expect(shouldIgnore(repo, '.git/index')).toBe(false)
    expect(shouldIgnore(repo, '.git/HEAD')).toBe(false)
    expect(shouldIgnore(repo, '.git/MERGE_HEAD')).toBe(false)
    expect(shouldIgnore(repo, '.git/refs/heads/main')).toBe(false)
    expect(shouldIgnore(repo, '.git/rebase-merge/msgnum')).toBe(false)
  })

  it('ignores node_modules and accepts both path separators', () => {
    expect(shouldIgnore(repo, 'node_modules/vite/index.js')).toBe(true)
    expect(shouldIgnore(repo, 'src\\main\\index.ts')).toBe(false)
    expect(shouldIgnore(repo, '.git\\logs\\HEAD')).toBe(true)
  })
})
