import type { AccountProvider } from './models'

/**
 * The renderer-safe half of browser sign-in: everything the sign-in panel
 * needs to tell someone how to give Aspen an OAuth application. Kept free of
 * Node imports (unlike providers/oauth-urls.ts, which pulls in `crypto`) so
 * the renderer bundle can import it, and free of Electron so the URL
 * contract is unit-testable.
 */

/** The loopback redirect to type into the registration form, byte for byte. */
export const OAUTH_CALLBACK_URL = 'http://127.0.0.1:8765/callback'

const CLOUD_ROOT: Record<AccountProvider, string> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com'
}

/**
 * Site root a browser sign-in would run against: the instance line when it
 * names one (scheme optional, API suffix and trailing slashes trimmed), the
 * provider's cloud host when it does not. Mirrors the normalization main
 * applies in providers/oauth.ts, so the setup copy and the actual authorize
 * URL always name the same server.
 */
export function oauthInstanceRoot(
  provider: AccountProvider,
  instance?: string
): string {
  const value = (instance ?? '').trim()
  if (value.length === 0) return CLOUD_ROOT[provider]
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`
  try {
    const url = new URL(withScheme)
    const path = url.pathname
      .replace(/\/+$/, '')
      .replace(/\/api\/v3$/i, '')
      .replace(/\/api\/v4$/i, '')
    const root = `${url.origin}${path}`
    return root.length > 0 ? root : CLOUD_ROOT[provider]
  } catch {
    return CLOUD_ROOT[provider]
  }
}

/** The host to name in the setup copy — 'github.com', or the instance host. */
export function oauthInstanceLabel(
  provider: AccountProvider,
  instance?: string
): string {
  const root = oauthInstanceRoot(provider, instance)
  try {
    return new URL(root).host.toLowerCase()
  } catch {
    return root
  }
}

/**
 * Where to register the application. The cloud paths go straight to the
 * creation form; a self-hosted server opens its developer-settings listing
 * (org/instance permissions vary, so the form itself is one click away
 * rather than a guess at its path).
 */
export function appRegistrationUrl(
  provider: AccountProvider,
  instance?: string
): string {
  const root = oauthInstanceRoot(provider, instance)
  if (provider === 'gitlab') return `${root}/-/user_settings/applications`
  return root === CLOUD_ROOT.github
    ? `${root}/settings/applications/new`
    : `${root}/settings/developer/applications`
}

/**
 * Ordered registration steps shown in the panel's one-step setup. The two
 * traps that silently break the flow afterwards — GitHub's Device Flow tick
 * box and GitLab's confidential flag — are spelled out rather than assumed.
 */
export function appSetupSteps(
  provider: AccountProvider,
  instance?: string
): readonly string[] {
  const host = oauthInstanceLabel(provider, instance)
  if (provider === 'github') {
    return [
      `On ${host}, register a new OAuth application — any name, any homepage URL.`,
      'Authorization callback URL: any URL you like — the code sign-in never redirects back to Aspen.',
      'Tick “Enable Device Flow”; without it GitHub refuses the code sign-in.',
      'Paste the Client ID below. It is public by design; Aspen never needs the secret.'
    ]
  }
  return [
    `On ${host}, create an application — any name.`,
    `Redirect URI: exactly ${OAUTH_CALLBACK_URL}.`,
    'Confidential: OFF — Aspen is a public PKCE client.',
    'Tick the api scope, then paste the numeric Application ID below.'
  ]
}
