import { describe, expect, it } from 'vitest'
import {
  buildTokenAuthEnv,
  httpsHostOf,
  isGitAuthFailure
} from '../src/main/git/auth'

describe('isGitAuthFailure', () => {
  it("recognizes git's own prompt refusals", () => {
    expect(
      isGitAuthFailure(
        "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
      )
    ).toBe(true)
    expect(
      isGitAuthFailure("fatal: could not read Password for 'https://gitlab.com': cannot prompt interactively")
    ).toBe(true)
  })

  it("recognizes provider-side rejections surfaced through the helper", () => {
    expect(isGitAuthFailure('remote: Invalid username or token.')).toBe(true)
    expect(isGitAuthFailure('remote: HTTP Basic: Access denied')).toBe(true)
    expect(
      isGitAuthFailure('remote: Support for password authentication was removed.')
    ).toBe(true)
    expect(
      isGitAuthFailure('fatal: unable to access: The requested URL returned error: 401')
    ).toBe(true)
    expect(
      isGitAuthFailure('fatal: unable to access: The requested URL returned error: 403')
    ).toBe(true)
  })

  it('does not claim non-auth failures it cannot answer with a token', () => {
    expect(isGitAuthFailure("fatal: repository 'https://github.com/o/nope.git/' not found")).toBe(false)
    expect(isGitAuthFailure('Already up to date.')).toBe(false)
    expect(isGitAuthFailure('Connection timed out after 15000ms')).toBe(false)
    expect(isGitAuthFailure('Permission denied (publickey)')).toBe(false)
  })
})

describe('httpsHostOf', () => {
  it('reads the host of https remotes only', () => {
    expect(httpsHostOf('https://github.com/owner/repo.git')).toBe('github.com')
    expect(httpsHostOf('https://GHE.Corp.Example:8443/owner/repo.git')).toBe('ghe.corp.example')
    expect(httpsHostOf('git@github.com:owner/repo.git')).toBeNull()
    expect(httpsHostOf('ssh://git@github.com/owner/repo')).toBeNull()
    expect(httpsHostOf('/srv/git/repo')).toBeNull()
  })
})

describe('buildTokenAuthEnv', () => {
  it('scopes one Basic header to exactly the URL origin', () => {
    const env = buildTokenAuthEnv('https://github.com/owner/repo.git', {
      user: 'octo',
      token: 'ghp_secret123'
    })
    expect(env).toEqual({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com.extraHeader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from('octo:ghp_secret123', 'utf8').toString('base64')}`
    })
  })

  it('keeps enterprise ports inside the config key', () => {
    const env = buildTokenAuthEnv('https://gitlab.corp.example:8443/g/p.git', {
      user: 'oauth2',
      token: 'glpat'
    })
    expect(env?.GIT_CONFIG_KEY_0).toBe('http.https://gitlab.corp.example:8443.extraHeader')
  })

  it('returns null for remotes a header cannot serve', () => {
    expect(buildTokenAuthEnv('git@github.com:owner/repo.git', { user: 'u', token: 't' })).toBeNull()
    expect(buildTokenAuthEnv('not a url', { user: 'u', token: 't' })).toBeNull()
  })
})
