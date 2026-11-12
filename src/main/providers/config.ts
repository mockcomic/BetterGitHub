/**
 * Compiled defaults for browser sign-in.
 *
 * - GitHub (**device-code flow** — the only browser sign-in GitHub offers):
 *   press **Sign in with GitHub**, Aspen shows a one-time code, you paste it at
 *   github.com/login/device. No local port and no redirect to catch.
 * - GitLab (**authorization code + PKCE**): User settings → Applications,
 *   confidential **off** (Aspen is a public PKCE client), redirect URI exactly
 *   `http://127.0.0.1:<OAUTH_REDIRECT_PORT>/callback`, scope `api`.
 *
 * ## The GitHub id ships filled in
 *
 * A device-code exchange needs an OAuth App whose **Enable Device Flow** box is
 * ticked, so GitHub ships with one baked in: the id of GitHub's own **GitHub
 * CLI** app, the very same public constant `gh` embeds in
 * `internal/authflow/flow.go` (its secret is likewise safe in version control,
 * and a device flow needs neither anyway — Aspen never sends one). Verified
 * against the live endpoint: `POST /login/device/code` with this id and
 * `scope=repo` returns a `user_code` and `verification_uri`.
 *
 * Two consequences worth knowing:
 *
 *   - GitHub's approval page names the app it was issued to, so a stock build
 *     says **GitHub CLI**, and the resulting token is listed under that app in
 *     the user's Settings → Applications. Register your own app and paste its
 *     id to have the page name Aspen instead.
 *   - The id is per-server. On **GitHub Enterprise** this app does not exist,
 *     so sign-in there needs an OAuth App registered on that host (tick
 *     *Enable Device Flow*; the callback URL may be anything) and its id
 *     pasted into Preferences → Accounts.
 *
 * To register your own app: Settings → Developer settings → OAuth Apps → new
 * app, homepage URL anything, Authorization callback URL anything too (the
 * device flow never redirects back to it), and tick **Enable Device Flow**.
 * Then either
 *
 *   1. put the id in the constant below and rebuild → every install gets it;
 *   2. paste it under Preferences → Accounts → Browser sign-in apps (or into
 *      the sign-in panel's **Use your own OAuth App** step) → no rebuild; a
 *      value entered there wins over the constant, and clearing it falls back
 *      to the baked-in id.
 *
 * Only the id is ever used — no client secret exists in this app, which is why
 * the ids are safe to ship. `DEFAULT_GITLAB_CLIENT_ID` is still empty: GitLab
 * has no equivalent shared app, so its first browser sign-in walks the user
 * through registering one, and GitLab token sign-in (which also covers
 * self-hosted instances) needs none of this.
 */
export const DEFAULT_GITHUB_CLIENT_ID = '178c6fc778ccc68e1d6a'
export const DEFAULT_GITLAB_CLIENT_ID = ''

/**
 * Fixed loopback port for the browser sign-in redirect. It serves the
 * **GitLab** authorization-code flow only (GitHub's device flow needs no
 * port), and it must match the redirect URI registered on the application, so
 * it is not ephemeral; a busy port makes the GitLab web flow fail with an
 * actionable message.
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
