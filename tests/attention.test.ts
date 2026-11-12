import { describe, expect, it } from 'vitest'
import type { FileStatus, RepositoryStatus } from '../src/shared/models'
import {
  authRevokedAttention,
  conflictedPaths,
  conflictSignature,
  conflictsAttention,
  mergeAttentionCause,
  pullAttentionCause,
  pushRejectedAttention,
  updateAvailableAttention,
  workflowKindOf,
  workflowNoun
} from '../src/renderer/src/attention'

function file(path: string, conflicted = false): FileStatus {
  return {
    path,
    indexCode: conflicted ? 'U' : 'M',
    worktreeCode: conflicted ? 'U' : 'M',
    kind: conflicted ? 'conflicted' : 'modified',
    staged: false,
    hasWorktreeChanges: true,
    untracked: false
  }
}

function status(
  files: FileStatus[],
  inProgress: RepositoryStatus['inProgress'] = {
    merge: false,
    rebase: false,
    cherryPick: false,
    revert: false
  }
): RepositoryStatus {
  const conflictCount = files.filter(f => f.kind === 'conflicted').length
  return {
    branch: 'main',
    oid: 'abc',
    ahead: 0,
    behind: 0,
    detached: false,
    files,
    conflictCount,
    inProgress
  }
}

const noop = (): void => undefined

describe('workflowKindOf', () => {
  it('names no owner for an idle worktree', () => {
    expect(
      workflowKindOf({ merge: false, rebase: false, cherryPick: false, revert: false })
    ).toBeNull()
  })

  it('ranks the rebase above every other paused operation', () => {
    expect(
      workflowKindOf({ merge: true, rebase: true, cherryPick: true, revert: true })
    ).toBe('rebase')
  })

  it('keeps revert and cherry-pick apart like the status reader does', () => {
    expect(workflowKindOf({ merge: false, rebase: false, cherryPick: true, revert: true })).toBe('revert')
    expect(workflowKindOf({ merge: false, rebase: false, cherryPick: true, revert: false })).toBe('cherryPick')
  })
})

describe('workflowNoun', () => {
  it('spells the display noun for each operation', () => {
    expect(workflowNoun('merge')).toBe('merge')
    expect(workflowNoun('rebase')).toBe('rebase')
    expect(workflowNoun('revert')).toBe('revert')
    expect(workflowNoun('cherryPick')).toBe('cherry-pick')
  })
})

describe('conflictedPaths', () => {
  it('lists only the conflicted paths, in git\'s order', () => {
    const s = status([
      file('src/a.ts'),
      file('src/b.ts', true),
      file('docs/c.md', true),
      file('README.md')
    ])
    expect(conflictedPaths(s)).toEqual(['src/b.ts', 'docs/c.md'])
  })
})

describe('conflictSignature', () => {
  it('is the same for the same set in any order', () => {
    expect(conflictSignature(['b', 'a'])).toBe(conflictSignature(['a', 'b']))
  })

  it('changes when the set changes', () => {
    expect(conflictSignature(['a'])).not.toBe(conflictSignature(['a', 'b']))
  })
})

describe('conflictsAttention', () => {
  const conflicted = status([file('src/b.ts', true), file('docs/c.md', true)])
  const paused = (kind: Partial<RepositoryStatus['inProgress']>) =>
    status(
      [file('src/b.ts', true)],
      { merge: false, rebase: false, cherryPick: false, revert: false, ...kind }
    )

  it('names the operation that caused it when one is known', () => {
    const request = conflictsAttention(conflicted, mergeAttentionCause('feat', 'main'))
    expect(request).toEqual({
      kind: 'conflicts',
      title: 'Merging "feat" into "main" stopped on conflicts',
      cause: 'Merging "feat" into "main"'
    })
  })

  it('pulls the branch into the caption for a conflicted pull', () => {
    const request = conflictsAttention(conflicted, pullAttentionCause('dev'))
    expect(request.kind).toBe('conflicts')
    if (request.kind === 'conflicts') {
      expect(request.title).toBe('Pulling into "dev" stopped on conflicts')
    }
  })

  it('falls back to the paused workflow when the cause is unknown', () => {
    expect(conflictsAttention(paused({ rebase: true })).title).toBe(
      'Resolve the conflicts to finish the rebase'
    )
  })

  it('falls back to the bare count with no workflow and no cause', () => {
    expect(conflictsAttention(conflicted).title).toBe('2 files are conflicted')
    expect(conflictsAttention(paused({})).title).toBe('One file is conflicted')
  })

  it('omits the cause line when none was passed', () => {
    const request = conflictsAttention(conflicted)
    expect(request.kind === 'conflicts' && 'cause' in request).toBe(false)
  })
})

describe('pushRejectedAttention', () => {
  it('is a deferrable notice carrying the whole recovery', () => {
    const request = pushRejectedAttention(noop)
    expect(request.kind).toBe('notice')
    if (request.kind !== 'notice') return
    expect(request.id).toBe('push-rejected')
    expect(request.title).toBe('Push rejected — the remote moved ahead')
    expect(request.message).toContain('Pull first, then push again.')
    expect(request.dismissLabel).toBe('Later')
    expect(request.actions).toHaveLength(1)
    expect(request.actions[0]).toMatchObject({ label: 'Pull & Push', primary: true })
  })
})

describe('authRevokedAttention', () => {
  it('spells one revoked account as provider · login', () => {
    const request = authRevokedAttention([{ login: 'mockcomic', provider: 'github' }], noop)
    expect(request.kind === 'notice' && request.message).toContain('GitHub · mockcomic')
  })

  it('joins several revoked accounts with "and"', () => {
    const request = authRevokedAttention(
      [
        { login: 'mockcomic', provider: 'github' },
        { login: 'dev', provider: 'gitlab' }
      ],
      noop
    )
    expect(request.kind === 'notice' && request.message).toContain(
      'GitHub · mockcomic and GitLab · dev'
    )
  })
})

describe('updateAvailableAttention', () => {
  it('names the version when the push carries one', () => {
    const request = updateAvailableAttention('0.3.0', noop)
    expect(request.kind === 'notice' && request.message).toContain('Aspen 0.3.0 is available')
  })

  it('degrades to the versionless wording when the push does not', () => {
    const request = updateAvailableAttention(null, noop)
    expect(request.kind === 'notice' && request.message).toContain('a newer version')
  })
})
