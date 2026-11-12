import { createHash, randomBytes } from 'crypto'

/**
 * Pure pieces of the GitLab browser sign-in: the PKCE material, the
 * authorize-URL shape, and the loopback callback parsing. Kept free of
 * Electron imports so the URL contracts are unit-testable in isolation.
 * (GitHub signs in through the device-code flow, which needs no authorize URL
 * and no redirect — see providers/oauth.ts.)
 */

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Fresh RFC 7636 S256 verifier/challenge pair plus a CSRF state token. */
export function pkceMaterial(): {
  verifier: string
  challenge: string
  state: string
} {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge, state: randomBytes(16).toString('hex') }
}

/** GitLab's authorization-code + PKCE endpoint (instance root). */
export function gitlabAuthorizeUrl(
  instanceRoot: string,
  clientId: string,
  redirectUri: string,
  state: string,
  challenge: string
): string {
  return (
    `${instanceRoot}/oauth/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=api` +
    `&state=${state}` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256`
  )
}

/** What the shared loopback callback server reads out of a redirect URL. */
export interface CallbackParams {
  readonly code: string | null
  readonly state: string | null
  readonly error: string | null
  readonly errorDescription: string | null
}

export function parseCallbackParams(requestUrl: string): CallbackParams {
  const url = new URL(requestUrl, `http://127.0.0.1`)
  return {
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    error: url.searchParams.get('error'),
    errorDescription: url.searchParams.get('error_description')
  }
}
