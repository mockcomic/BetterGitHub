/**
 * The silent one-shot token retry for hosted remotes.
 *
 * Sync verbs keep authenticating the way they always have — through the
 * system git credential helper. Only when git itself reports an
 * authentication failure does GitDesk rerun the exact command once,
 * injecting the signed-in account's token for that host as a
 * host-scoped `http.<url>.extraHeader` via the GIT_CONFIG_* environment
 * (git 2.31+). The token therefore never appears in the command line,
 * never lands in `.git/config`, and is never sent to any other host on a
 * redirect (the config key is the URL prefix, which git longest-prefix
 * matches).
 */

export interface GitTokenCredential {
  /** Basic-auth username: the account login (GitHub) or `oauth2` (GitLab). */
  readonly user: string
  readonly token: string
}

const AUTH_FAILURE_PATTERNS: ReadonlyArray<RegExp> = [
  // git's own prompts, refused under GIT_TERMINAL_PROMPT=0.
  /could not read (a )?username for/i,
  /could not read password for/i,
  /terminal prompts disabled/i,
  /cannot prompt interactively/i,
  // Server-side rejections surfaced through the helper.
  /authentication failed/i,
  /invalid username or (password|token)/i,
  /http basic: access denied/i, // GitLab
  /support for password authentication was removed/i, // GitHub, password gone
  /returned error: 401/i,
  /the requested url returned error: 403/i
]

/** True when git failed for auth reasons a stored token could answer. */
export function isGitAuthFailure(gitOutput: string): boolean {
  return AUTH_FAILURE_PATTERNS.some(p => p.test(gitOutput))
}

/** Https host of a remote URL, or null for ssh/scp-style and local paths. */
export function httpsHostOf(remoteUrl: string): string | null {
  try {
    const url = new URL(remoteUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * GIT_CONFIG_* environment entries that attach `Authorization: Basic …` to
 * requests for exactly the URL's origin. Returns null for non-http(s)
 * URLs (ssh remotes authenticate via keys, not tokens).
 */
export function buildTokenAuthEnv(
  remoteUrl: string,
  credential: GitTokenCredential
): Record<string, string> | null {
  let url: URL
  try {
    url = new URL(remoteUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const origin = url.origin.toLowerCase()
  const basic = Buffer.from(`${credential.user}:${credential.token}`, 'utf8').toString(
    'base64'
  )
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `http.${origin}.extraHeader`,
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`
  }
}
