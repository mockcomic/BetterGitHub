/**
 * Pure helpers that turn an `origin` URL into browsable web URLs. Works for
 * any host using GitHub's `/commit/<sha>` and `/tree/<branch>` layout, which
 * covers github.com and typical self-hosted Gitea/GitHub-style remotes.
 */

export interface WebRepository {
  /** e.g. `https://github.com/owner/repo` (no trailing slash). */
  readonly webUrl: string
  readonly host: string
  readonly path: string
}

/** Returns null when the remote is not a host/path style URL we can map. */
export function toWebRepository(remoteUrl: string | null): WebRepository | null {
  if (remoteUrl === null) return null
  const trimmed = remoteUrl.trim()
  if (trimmed.length === 0) return null

  let host = ''
  let path = ''

  const scheme = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(
    trimmed
  )
  if (scheme !== null) {
    host = scheme[1]
    path = scheme[2]
  } else {
    // scp-like syntax: [user@]host:path (e.g. git@github.com:owner/repo.git)
    const scp = /^(?:[^@/]+@)?([^:/\\\s]+):(.+)$/i.exec(trimmed)
    if (scp === null) return null
    host = scp[1]
    path = scp[2]
    // A single-letter host is a Windows drive path (`C:/repos/x`), not an
    // scp-like remote — mapping it would produce a nonsense https://C/... URL.
    if (host.length === 1) return null
  }

  const cleanPath = path
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '')

  const segments = cleanPath.split('/').filter(s => s.length > 0)
  if (host.length === 0 || segments.length < 2) return null

  return {
    webUrl: `https://${host}/${segments.join('/')}`,
    host,
    path: segments.join('/')
  }
}

export function commitUrl(repo: WebRepository, sha: string): string {
  return `${repo.webUrl}/commit/${encodeURIComponent(sha)}`
}

/**
 * Encode a git ref for a URL path segment: encodeURIComponent covers `#`,
 * `?` and `&` (all legal in refnames and fatal to a URL when left raw), then
 * `%2F` is restored so slash-separated refs like `feature/my-thing` stay
 * readable paths.
 */
function encodeRef(ref: string): string {
  return encodeURIComponent(ref).replace(/%2F/g, '/')
}

export function branchUrl(repo: WebRepository, branch: string): string {
  return `${repo.webUrl}/tree/${encodeRef(branch)}`
}

export function compareUrl(
  repo: WebRepository,
  base: string,
  head: string
): string {
  return `${repo.webUrl}/compare/${encodeRef(base)}...${encodeRef(head)}`
}
