import { describe, expect, it } from 'vitest'
import {
  appRegistrationUrl,
  appSetupSteps,
  oauthInstanceLabel,
  oauthInstanceRoot,
  OAUTH_CALLBACK_URL
} from '../src/shared/oauth-setup'
import { OAUTH_REDIRECT_URI, DEFAULT_GITHUB_CLIENT_ID } from '../src/main/providers/config'

describe('DEFAULT_GITHUB_CLIENT_ID', () => {
  it('ships a device-flow id so the GitHub button shows a code with no setup', () => {
    // The device-code flow cannot start without an OAuth App id, so an empty
    // constant here means the button opens the registration step instead of
    // generating a code — the whole point of GitHub sign-in in this app.
    expect(DEFAULT_GITHUB_CLIENT_ID.trim().length).toBeGreaterThan(0)
  })
})

describe('OAUTH_CALLBACK_URL', () => {
  it('is the exact redirect the loopback server listens for', () => {
    // The sign-in panel tells people to type this into a registration form,
    // so it must be the same string main binds, not a copy that can drift.
    expect(OAUTH_CALLBACK_URL).toBe(OAUTH_REDIRECT_URI)
  })
})

describe('oauthInstanceRoot', () => {
  it('falls back to the provider cloud host when no instance is given', () => {
    expect(oauthInstanceRoot('github')).toBe('https://github.com')
    expect(oauthInstanceRoot('gitlab', '   ')).toBe('https://gitlab.com')
    expect(oauthInstanceRoot('gitlab', undefined)).toBe('https://gitlab.com')
  })

  it('adds the scheme and trims the API suffix, like the sign-in flow does', () => {
    expect(oauthInstanceRoot('github', 'github.corp.example/')).toBe(
      'https://github.corp.example'
    )
    expect(oauthInstanceRoot('github', 'https://ghe.corp.example/api/v3')).toBe(
      'https://ghe.corp.example'
    )
    expect(oauthInstanceRoot('gitlab', 'gitlab.example.com/')).toBe(
      'https://gitlab.example.com'
    )
    expect(oauthInstanceRoot('gitlab', 'https://gl.example/api/v4')).toBe(
      'https://gl.example'
    )
  })

  it('keeps a subpath root and a non-default port', () => {
    expect(oauthInstanceRoot('github', 'https://ghe.corp.example/base/')).toBe(
      'https://ghe.corp.example/base'
    )
    expect(oauthInstanceRoot('gitlab', 'http://gl.localhost:8080')).toBe(
      'http://gl.localhost:8080'
    )
  })

  it('reads an unparsable instance as the cloud host rather than a broken URL', () => {
    expect(oauthInstanceRoot('github', '::::')).toBe('https://github.com')
  })
})

describe('oauthInstanceLabel', () => {
  it('names the cloud host by default and the instance host otherwise', () => {
    expect(oauthInstanceLabel('github')).toBe('github.com')
    expect(oauthInstanceLabel('gitlab')).toBe('gitlab.com')
    expect(oauthInstanceLabel('gitlab', 'GitLab.Example.com/')).toBe(
      'gitlab.example.com'
    )
    expect(oauthInstanceLabel('github', 'ghe.corp.example/base')).toBe(
      'ghe.corp.example'
    )
  })
})

describe('appRegistrationUrl', () => {
  it('goes straight to the creation form on the cloud hosts', () => {
    expect(appRegistrationUrl('github')).toBe(
      'https://github.com/settings/applications/new'
    )
    expect(appRegistrationUrl('gitlab')).toBe(
      'https://gitlab.com/-/user_settings/applications'
    )
  })

  it('opens the developer-settings listing on an instance', () => {
    expect(appRegistrationUrl('github', 'github.corp.example')).toBe(
      'https://github.corp.example/settings/developer/applications'
    )
    expect(appRegistrationUrl('gitlab', 'gitlab.example.com')).toBe(
      'https://gitlab.example.com/-/user_settings/applications'
    )
    expect(appRegistrationUrl('github', 'https://ghe.corp.example/api/v3')).toBe(
      'https://ghe.corp.example/settings/developer/applications'
    )
  })
})

describe('appSetupSteps', () => {
  it('gives GitHub the Device Flow tick box, no callback, and the secret note', () => {
    const steps = appSetupSteps('github')
    expect(steps).toHaveLength(4)
    // GitHub signs in with the device one-time code only — nothing may
    // instruct the user to register a loopback callback.
    expect(steps.join('\n')).not.toContain('127.0.0.1:8765')
    expect(steps.some(s => s.includes('Enable Device Flow'))).toBe(true)
    expect(steps.some(s => s.includes('Client ID'))).toBe(true)
    expect(steps[0]).toContain('github.com')
  })

  it('gives GitLab the callback, the confidential flag and the api scope', () => {
    const steps = appSetupSteps('gitlab')
    expect(steps).toHaveLength(4)
    expect(steps.join('\n')).toContain('http://127.0.0.1:8765/callback')
    expect(steps.some(s => /Confidential/i.test(s))).toBe(true)
    expect(steps.some(s => s.includes('api'))).toBe(true)
  })

  it('names the instance the id will be registered on', () => {
    expect(appSetupSteps('gitlab', 'gl.corp.example')[0]).toContain(
      'gl.corp.example'
    )
    expect(appSetupSteps('github', 'ghe.corp.example')[0]).toContain(
      'ghe.corp.example'
    )
  })
})
