import { describe, expect, it } from 'vitest'
import {
  aiLooksUnconfigured,
  showStagedBadges,
  syncVerb
} from '../src/renderer/src/progressive'
import type {
  FileStatus,
  PublicSettings,
  RepositoryStatus
} from '../src/shared/models'

function file(patch: Partial<FileStatus> = {}): FileStatus {
  return {
    path: 'a.txt',
    indexCode: 'M',
    worktreeCode: 'M',
    kind: 'modified',
    staged: false,
    hasWorktreeChanges: true,
    untracked: false,
    ...patch
  }
}

function status(patch: Partial<RepositoryStatus> = {}): RepositoryStatus {
  return {
    branch: 'main',
    oid: 'deadbeef',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    detached: false,
    files: [],
    conflictCount: 0,
    inProgress: {
      merge: false,
      rebase: false,
      cherryPick: false,
      revert: false
    },
    ...patch
  }
}

function settings(
  patch: Partial<PublicSettings['ai']> = {},
  hasApiKey = false
): PublicSettings {
  return {
    ai: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      customInstructions: '',
      hasApiKey,
      ...patch
    },
    accounts: { hasGitHubClientId: false, hasGitLabClientId: false },
    confirmOverrideWithGeneratedMessage: true,
    autoRefresh: true,
    autoFetchMinutes: 5,
    scanFolder: '',
    theme: 'system',
    hintsEnabled: true,
    autoUpdateChecks: true
  }
}

describe('syncVerb', () => {
  it('is fetch before any status has loaded', () => {
    expect(syncVerb(null)).toBe('fetch')
  })

  it('the rejected-push flag converts the verb even before status knows', () => {
    expect(syncVerb(status(), true)).toBe('sync')
    expect(syncVerb(status({ behind: 3 }), true)).toBe('sync')
    // Still no status loaded — nothing to reason about yet.
    expect(syncVerb(null, true)).toBe('fetch')
    // The flag alone (default false) changes the in-sync answer, not the
    // plain ahead/behind answers that already match git truth.
    expect(syncVerb(status({ behind: 3 }))).toBe('pull')
  })

  it('a diverged branch earns the compound Pull & Push verb', () => {
    expect(syncVerb(status({ behind: 2, ahead: 1 }))).toBe('sync')
  })

  it('catches up when behind with nothing to send', () => {
    expect(syncVerb(status({ behind: 2 }))).toBe('pull')
  })

  it('publishes local work when ahead', () => {
    expect(syncVerb(status({ ahead: 1 }))).toBe('push')
  })

  it('offers push for a branch without an upstream even at 0/0', () => {
    expect(syncVerb(status({ upstream: undefined }))).toBe('push')
  })

  it('settles on fetch when everything is in sync', () => {
    expect(syncVerb(status())).toBe('fetch')
  })

  it('pushes a branch whose upstream was deleted on the remote', () => {
    // git's own counts read 0/0 against a missing ref, which would otherwise
    // land in the in-sync branch above and silently strand the work.
    expect(syncVerb(status({ upstreamGone: true }))).toBe('push')
    // Push is the only recovery, so even the rejected-push flag cannot turn it
    // into the compound verb — there is nothing to pull from.
    expect(syncVerb(status({ upstreamGone: true }), true)).toBe('push')
    expect(
      syncVerb(status({ upstreamGone: true, behind: 2, ahead: 1 }))
    ).toBe('push')
  })
})

describe('showStagedBadges', () => {
  it('hides badges while nothing is staged', () => {
    expect(showStagedBadges(status({ files: [file(), file({ untracked: true })] }))).toBe(false)
    expect(showStagedBadges(null)).toBe(false)
  })

  it('shows badges as soon as the staging area holds anything', () => {
    expect(
      showStagedBadges(status({ files: [file(), file({ path: 'b.txt', staged: true })] }))
    ).toBe(true)
  })
})

describe('aiLooksUnconfigured', () => {
  it('treats the compiled OpenAI default without a key as unconfigured', () => {
    expect(aiLooksUnconfigured(settings())).toBe(true)
    expect(aiLooksUnconfigured(settings({}, true))).toBe(false)
  })

  it('treats a keyless custom endpoint (local server) as configured', () => {
    expect(
      aiLooksUnconfigured(settings({ baseUrl: 'http://localhost:11434/v1' }))
    ).toBe(false)
  })

  it('treats an emptied Base URL as unconfigured', () => {
    expect(aiLooksUnconfigured(settings({ baseUrl: '  ' }))).toBe(true)
  })

  it('is not opinionated before settings have loaded', () => {
    expect(aiLooksUnconfigured(null)).toBe(false)
  })
})
