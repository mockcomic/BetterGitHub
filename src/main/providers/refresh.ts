import type { AccountCredential } from '../accounts'
import { apiFetch, str } from './http'

/**
 * Exchange a GitLab OAuth refresh token for a fresh access token. Returns
 * null on any failure (no client id, revoked grant, network) — the caller
 * then hands out the old token and lets the provider's own 401 explain.
 */
export async function gitlabRefreshToken(
  apiBase: string,
  clientId: string,
  credential: AccountCredential
): Promise<AccountCredential | null> {
  if (clientId.length === 0 || credential.refreshToken === null) return null
  try {
    const res = await apiFetch(`${apiBase}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: credential.refreshToken
      }).toString()
    })
    if (!res.ok) return null
    const token = str(res.json.access_token)
    if (token === null) return null
    const expiresIn =
      typeof res.json.expires_in === 'number' && res.json.expires_in > 0
        ? res.json.expires_in
        : 7200
    return {
      token,
      refreshToken: str(res.json.refresh_token) ?? credential.refreshToken,
      expiresAt: Date.now() + expiresIn * 1000
    }
  } catch {
    return null
  }
}
