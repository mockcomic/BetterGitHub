import { describe, expect, it } from 'vitest'
import {
  PUSH_NEEDS_FORK_MESSAGE,
  PUSH_NEEDS_PULL_MESSAGE,
  isNeedsForkRejectionMessage,
  isNeedsPullRejectionMessage,
  isPushPermissionDenied,
  isRemoteMovedAhead
} from '../src/shared/push-rejection'

// Real `git push` stderr shapes, "To <remote>" first line included — the
// renderer only ever sees the first non-empty line of that output, which is
// exactly why main replaces it for this rejection family.
const FETCH_FIRST = `To github.com:owner/repo.git
 ! [rejected]          main -> main (fetch first)
error: failed to push some refs to 'github.com:owner/repo.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing to
hint: the same ref. If you want to integrate the remote changes, use
hint: 'git pull' before pushing again.`

const BEHIND_TIP = `To https://github.com/owner/repo.git
 ! [rejected]          main -> main (non-fast-forward)
error: failed to push some refs to 'https://github.com/owner/repo.git'
hint: Updates were rejected because the tip of your current branch is behind`

const PROTECTED_BRANCH = `To github.com:owner/repo.git
 ! [remote rejected]   main -> main (push declined due to repository rule violations)
error: failed to push some refs to 'github.com:owner/repo.git'`

const HOOK_FAILURE = `To github.com:owner/repo.git
 ! [pre-push rejected] main -> main (pre-push hook declined)
error: failed to push some refs to 'github.com:owner/repo.git'`

// The permission family: git's own first line is still "To <remote>", so
// without a dedicated shape these all surfaced as that useless message.
const DENIED_SSH = `ERROR: Permission to owner/repo.git denied to octo.
fatal: Could not read from remote repository.

Please make sure you have the correct access rights
and the repository exists.`

const DENIED_HTTPS = `remote: Permission to owner/repo.git denied to octo.
fatal: unable to access 'https://github.com/owner/repo.git/': The requested URL returned error: 403`

const WRITE_ACCESS = `remote: Write access to repository not granted.
error: The requested URL returned error: 403 Forbidden
fatal: unable to access 'https://github.com/owner/repo.git/'`

// An ssh *authentication* failure (expired key), which the token-retry path
// already answers — never a fork invitation.
const PUBLICKEY_DENIED = `git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.`

describe('isRemoteMovedAhead', () => {
  it('detects the "fetch first" rejection', () => {
    expect(isRemoteMovedAhead(FETCH_FIRST)).toBe(true)
  })

  it('detects the behind-the-tip rejection', () => {
    expect(isRemoteMovedAhead(BEHIND_TIP)).toBe(true)
  })

  it('does not catch rejections a pull cannot fix', () => {
    expect(isRemoteMovedAhead(PROTECTED_BRANCH)).toBe(false)
    expect(isRemoteMovedAhead(HOOK_FAILURE)).toBe(false)
    expect(isRemoteMovedAhead('')).toBe(false)
  })

  it('does not catch permission refusals — those get the fork answer', () => {
    expect(isRemoteMovedAhead(DENIED_SSH)).toBe(false)
    expect(isRemoteMovedAhead(DENIED_HTTPS)).toBe(false)
    expect(isRemoteMovedAhead(WRITE_ACCESS)).toBe(false)
  })
})

describe('isPushPermissionDenied', () => {
  it('detects GitHub\'s "denied to" refusal over ssh', () => {
    expect(isPushPermissionDenied(DENIED_SSH)).toBe(true)
  })

  it('detects the https 403 shape', () => {
    expect(isPushPermissionDenied(DENIED_HTTPS)).toBe(true)
  })

  it('detects the older "Write access …" line', () => {
    expect(isPushPermissionDenied(WRITE_ACCESS)).toBe(true)
  })

  it('does not catch the rejections with their own answers', () => {
    expect(isPushPermissionDenied(FETCH_FIRST)).toBe(false)
    expect(isPushPermissionDenied(BEHIND_TIP)).toBe(false)
    expect(isPushPermissionDenied(PROTECTED_BRANCH)).toBe(false)
    expect(isPushPermissionDenied(HOOK_FAILURE)).toBe(false)
    // ssh authentication, owned by the token-retry path.
    expect(isPushPermissionDenied(PUBLICKEY_DENIED)).toBe(false)
    expect(isPushPermissionDenied('')).toBe(false)
  })
})

describe('isNeedsPullRejectionMessage', () => {
  it('matches the message main throws, so the toast offers the pull buttons', () => {
    expect(isNeedsPullRejectionMessage(PUSH_NEEDS_PULL_MESSAGE)).toBe(true)
  })

  it('leaves every other push failure as a plain error', () => {
    expect(
      isNeedsPullRejectionMessage(
        `git push failed (exit 1): To github.com:owner/repo.git`
      )
    ).toBe(false)
  })
})

describe('isNeedsForkRejectionMessage', () => {
  it('matches the message main throws, so the toast offers Create Fork', () => {
    expect(isNeedsForkRejectionMessage(PUSH_NEEDS_FORK_MESSAGE)).toBe(true)
  })

  it('is a separate family from the pull answer', () => {
    expect(isNeedsForkRejectionMessage(PUSH_NEEDS_PULL_MESSAGE)).toBe(false)
    expect(isNeedsPullRejectionMessage(PUSH_NEEDS_FORK_MESSAGE)).toBe(false)
  })
})
