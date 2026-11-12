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

/**
 * The head half of a pull request: a branch of this repository, or a branch
 * of a fork — GitHub's cross-repository ref syntax `user:repo:branch`, which
 * is how the fork workflow targets the parent repository's compare page.
 */
export interface PullRequestHead {
  readonly branch: string
  /** Set only for a fork head; both parts are required together. */
  readonly forkOwner?: string
  readonly forkName?: string
}

/**
 * The URL that opens GitHub's new-pull-request form: `…/compare/base...head`
 * with `?expand=1` so the description box is already open. For a fork head
 * the ref carries `forkOwner:forkName:branch` and the repository part is the
 * parent's — GitHub resolves the cross-repository diff from it. Colons stay
 * literal (they are legal in the path segment; GitHub's router wants them
 * plain) while slashes in the branch remain path-like, exactly as refs
 * already do in `compareUrl`.
 */
export function pullRequestUrl(
  baseRepo: WebRepository,
  baseBranch: string,
  head: PullRequestHead
): string {
  const headRef =
    head.forkOwner !== undefined && head.forkName !== undefined
      ? `${head.forkOwner}:${head.forkName}:${head.branch}`
      : head.branch
  const encoded = encodeRef(headRef).replace(/%3A/g, ':')
  return `${baseRepo.webUrl}/compare/${encodeRef(baseBranch)}...${encoded}?expand=1`
}
