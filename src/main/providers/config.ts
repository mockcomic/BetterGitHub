/**
 * Compiled defaults for browser sign-in. Device flow and OAuth PKCE both
 * need an application the user registers once:
 *
 * - GitHub: Settings → Developer settings → OAuth Apps → new app, homepage
 *   URL anything, and tick "Enable Device Flow"; paste the Client ID into
 *   Preferences → Accounts (or rebuild with this constant).
 * - GitLab: User settings → Applications, confidential **off**, redirect
 *   URI exactly `http://127.0.0.1:<GITLAB_REDIRECT_PORT>/callback`; scopes
 *   `api`. Paste the Application ID into Preferences → Accounts.
 *
 * Empty means "not configured": the browser buttons hide and token sign-in
 * (which also covers self-hosted instances) remains.
 */
export const DEFAULT_GITHUB_DEVICE_CLIENT_ID = ''
export const DEFAULT_GITLAB_CLIENT_ID = ''

/**
 * Fixed loopback port for the GitLab PKCE redirect. It must match the
 * redirect URI registered on the GitLab application, so it is not
 * ephemeral; a busy port fails with an actionable message.
 */
export const GITLAB_REDIRECT_PORT = 8765
export const GITLAB_REDIRECT_URI = `http://127.0.0.1:${GITLAB_REDIRECT_PORT}/callback`

/** GitHub's device-flow endpoints (github.com; GHES mirrors them per host). */
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
export const GITHUB_DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token'

/** Request timeouts shared by every hosted-API call. */
export const API_TIMEOUT_MS = 15_000
