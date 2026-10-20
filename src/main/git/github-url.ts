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

export function branchUrl(repo: WebRepository, branch: string): string {
  return `${repo.webUrl}/tree/${encodeURI(branch)}`
}

export function compareUrl(
  repo: WebRepository,
  base: string,
  head: string
): string {
  return `${repo.webUrl}/compare/${encodeURI(base)}...${encodeURI(head)}`
}
