/**
 * Compiled defaults for browser sign-in. Both GitHub flows (web OAuth with
 * PKCE and the device-code fallback) and GitLab's PKCE flow need one
 * application the user registers once:
 *
 * - GitHub: Settings → Developer settings → OAuth Apps → new app, homepage
 *   URL anything, **Authorization callback URL**
 *   `http://127.0.0.1:<OAUTH_REDIRECT_PORT>/callback`, and tick
 *   "Enable Device Flow"; one app serves both flows. Paste the Client ID
 *   into Preferences → Accounts (or rebuild with this constant).
 * - GitLab: User settings → Applications, confidential **off**, redirect
 *   URI exactly `http://127.0.0.1:<OAUTH_REDIRECT_PORT>/callback`; scopes
 *   `api`. Paste the Application ID into Preferences → Accounts.
 *
 * Empty means "not configured": the browser buttons hide and token sign-in
 * (which also covers self-hosted instances) remains.
 */
export const DEFAULT_GITHUB_CLIENT_ID = ''
export const DEFAULT_GITLAB_CLIENT_ID = ''

/**
 * Fixed loopback port for the browser sign-in redirect. It serves **both**
 * providers' authorization-code flows through one shared callback server
 * (dispatch on the `state` parameter), and it must match the redirect URI
 * registered on each application, so it is not ephemeral; a busy port
 * makes the web flow fail with an actionable message (GitHub then falls
 * back to the device flow, where a port is not needed).
 */
export const OAUTH_REDIRECT_PORT = 8765
export const OAUTH_REDIRECT_URI = `http://127.0.0.1:${OAUTH_REDIRECT_PORT}/callback`

/** GitHub's device-flow endpoints (github.com; GHES mirrors them per host). */
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
export const GITHUB_DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token'

/** Request timeouts shared by every hosted-API call. */
export const API_TIMEOUT_MS = 15_000

/** Cap for one avatar image fetched to a data: URL (GitHub/GitLab send ~KB). */
export const AVATAR_MAX_BYTES = 256 * 1024
