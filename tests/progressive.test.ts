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
    theme: 'system',
    hintsEnabled: true
  }
}

describe('syncVerb', () => {
  it('is fetch before any status has loaded', () => {
    expect(syncVerb(null)).toBe('fetch')
  })

  it('catches up first: behind wins over ahead', () => {
    expect(syncVerb(status({ behind: 2, ahead: 1 }))).toBe('pull')
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
