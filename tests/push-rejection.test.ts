import { describe, expect, it } from 'vitest'
import {
  PUSH_NEEDS_PULL_MESSAGE,
  isNeedsPullRejectionMessage,
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
