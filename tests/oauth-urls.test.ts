import { describe, expect, it } from 'vitest'
import {
  githubAuthorizeUrl,
  gitlabAuthorizeUrl,
  parseCallbackParams,
  pkceMaterial
} from '../src/main/providers/oauth-urls'

const REDIRECT = 'http://127.0.0.1:8765/callback'

describe('pkceMaterial', () => {
  it('produces an S256-verifier set with URL-safe, unpadded parts', () => {
    const a = pkceMaterial()
    const b = pkceMaterial()
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.state).toMatch(/^[0-9a-f]{32}$/)
    // Fresh material on every call (verifier, challenge and state all differ).
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.state).not.toBe(b.state)
  })
})

describe('githubAuthorizeUrl', () => {
  it('builds the cloud authorization URL with PKCE and the loopback redirect', () => {
    const url = new URL(
      githubAuthorizeUrl('https://github.com', 'Iv1.demo', REDIRECT, 'st123', 'chal')
    )
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('Iv1.demo')
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT)
    expect(url.searchParams.get('scope')).toBe('repo')
    expect(url.searchParams.get('state')).toBe('st123')
    expect(url.searchParams.get('code_challenge')).toBe('chal')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('sits under the instance path for GitHub Enterprise roots', () => {
    expect(
      githubAuthorizeUrl('https://ghe.corp.example/base', 'id', REDIRECT, 's', 'c')
    ).toContain('https://ghe.corp.example/base/login/oauth/authorize')
  })
})

describe('gitlabAuthorizeUrl', () => {
  it('keeps the api scope and the same PKCE shape', () => {
    const url = new URL(
      gitlabAuthorizeUrl('https://gitlab.example.com', 'app', REDIRECT, 'st', 'ch')
    )
    expect(url.origin + url.pathname).toBe('https://gitlab.example.com/oauth/authorize')
    expect(url.searchParams.get('scope')).toBe('api')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })
})

describe('parseCallbackParams', () => {
  it('reads code and state from a success redirect', () => {
    expect(parseCallbackParams('/callback?code=abc&state=xyz')).toEqual({
      code: 'abc',
      state: 'xyz',
      error: null,
      errorDescription: null
    })
  })

  it('reads the denial pair', () => {
    const parsed = parseCallbackParams(
      '/callback?error=access_denied&error_description=Nope+mate&state=xyz'
    )
    expect(parsed.code).toBeNull()
    expect(parsed.error).toBe('access_denied')
    expect(parsed.errorDescription).toBe('Nope mate')
  })

  it('tolerates a bare path', () => {
    expect(parseCallbackParams('/callback')).toEqual({
      code: null,
      state: null,
      error: null,
      errorDescription: null
    })
  })
})
