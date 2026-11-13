import type { CommitInfo, LogQuery } from '../../shared/models'
import { execGit } from './exec'

const FIELD_SEP = ''
const RECORD_SEP = ''

const DEFAULT_MAX_COUNT = 300

/**
 * Ceiling on the outgoing-set walk. It only bites for a branch that owes the
 * remote thousands of commits (typically a clone with no remote configured at
 * all); there the marks are dropped rather than claim a commit is pushed, and
 * the strip's ↑ count comes from status independently.
 */
const UNPUSHED_SET_CAP = 5000

export async function getLog(
  repoPath: string,
  query: LogQuery = {}
): Promise<CommitInfo[]> {
  const mode = query.unpushed ?? 'off'
  // Resolved before the walk so the restriction and the marks can never
  // disagree about which definition of "outgoing" this repository is in.
  const range = mode === 'off' ? [] : await unpushedRange(repoPath)
  // 'only' is git's own answer to the same question, so every row it hands
  // back is outgoing and the mark walk is skipped. 'mark' leaves the walk
  // whole — the history list still has to show the pushed commits, each one
  // without its mark — and answers the badge from the set below.
  let outgoing: ReadonlySet<string> | null = null
  if (mode === 'mark') {
    const set = await outgoingShas(repoPath, range)
    if (set.complete) outgoing = set.shas
  }

  const result = await execGit(
    buildLogArgs(query, mode === 'only' ? range : []),
    {
      cwd: repoPath,
      timeoutMs: 30_000
    }
  )

  return result.stdout
    .split(RECORD_SEP)
    .map(r => r.replace(/^\n+/, ''))
    .filter(r => r.trim().length > 0)
    .map(record => {
      const fields = record.split(FIELD_SEP)
      const [sha, parents, authorName, authorEmail, date, summary] = fields
      // %B is the final field: rejoin anything past it so a commit message
      // containing the raw separator byte cannot truncate the body.
      const body = fields.slice(6).join(FIELD_SEP)
      const parentList = (parents ?? '').split(' ').filter(p => p.length > 0)
      // %B includes the subject line; strip it, keeping only the body.
      const rawBody = (body ?? '').replace(/^\r?\n+/, '')
      const firstNewline = rawBody.indexOf('\n')
      const withoutSubject =
        firstNewline === -1 ? '' : rawBody.slice(firstNewline + 1)
      return {
        sha,
        parents: parentList,
        authorName: authorName ?? '',
        authorEmail: authorEmail ?? '',
        date: date ?? '',
        summary: summary ?? '',
        body: withoutSubject.trim(),
        isMerge: parentList.length > 1,
        unpushed: mode === 'only' || (outgoing !== null && outgoing.has(sha))
      }
    })
}

/**
 * Builds the `git log` argv. Exposed (and unit-tested) so the paging/search
 * contract stays stable: `--skip` + `--max-count` give "load more", `-i
 * --grep` / `--author` filter case-insensitively, and `range` — when the
 * caller asked about outgoing work — restricts the walk. An empty range keeps
 * the argv byte-identical to a plain log.
 */
export function buildLogArgs(
  query: LogQuery = {},
  range: ReadonlyArray<string> = []
): string[] {
  const maxCount = positiveInt(query.maxCount) ?? DEFAULT_MAX_COUNT
  const skip = positiveInt(query.skip) ?? 0

  const args = [
    'log',
    `--max-count=${maxCount}`,
    `--skip=${skip}`,
    `--format=${['%H', '%P', '%an', '%ae', '%aI', '%s', '%B'].join(FIELD_SEP)}${RECORD_SEP}`
  ]

  const search = query.search?.trim()
  if (search !== undefined && search.length > 0) {
    args.push('-i', `--grep=${search}`)
  }
  const author = query.author?.trim()
  if (author !== undefined && author.length > 0) {
    args.push(`--author=${author}`)
  }
  // The range goes last and raw. `--end-of-options` would break it, because
  // the no-upstream form carries `--not` — a revision option git insists on
  // parsing — and neither form can begin with a dash, so there is nothing to
  // disambiguate from a path anyway.
  args.push(...range)
  return args
}

/**
 * The revisions that answer "what has this branch not published yet", one
 * honest definition per branch state:
 *
 * - **Upstream set, remote ref present** → `@{upstream}..HEAD`, which is
 *   literally git's own `ahead` count, so an unpushed list can never be a
 *   different length from the ↑ chip beside Push.
 * - **Upstream set but its ref deleted on the server** (porcelain `[gone]`) →
 *   the fallback below. Comparing against a stale last-fetched value would
 *   report "nothing to push" on a desk whose only verb is Publish.
 * - **No upstream** (an unpublished branch) **or a detached HEAD** →
 *   `HEAD --not --remotes`: the commits no fetched remote branch carries,
 *   which is exactly what publishing sends. With no remote configured at all
 *   that is the whole history — true, not a bug.
 *
 * One probe covers all three: `--verify` resolves `@{upstream}` only while the
 * tracked ref is still there, and `--quiet` keeps git's complaint off both
 * streams so a miss is just an exit 1 (same shape as the `[gone]` probe in
 * src/main/git/status.ts).
 */
async function unpushedRange(
  repoPath: string
): Promise<ReadonlyArray<string>> {
  const live = await execGit(
    ['rev-parse', '--verify', '--quiet', '--end-of-options', '@{upstream}'],
    {
      cwd: repoPath,
      // A miss is the answer, not an error: 1 from `--verify` on a name that
      // resolves to nothing, 128 from a rev-expression git cannot parse at all.
      // Either way the fallback range below always works.
      successExitCodes: new Set([0, 1, 128]),
      timeoutMs: 10_000
    }
  )
  return live.exitCode === 0 && live.stdout.trim().length > 0
    ? ['@{upstream}..HEAD']
    : ['HEAD', '--not', '--remotes']
}

/**
 * The set behind {@link unpushedRange}, newest first. Small by nature — it is
 * the work a push will carry — and capped by {@link UNPUSHED_SET_CAP}, with an
 * incomplete answer reported rather than half-trusted.
 */
async function outgoingShas(
  repoPath: string,
  range: ReadonlyArray<string>
): Promise<{ shas: ReadonlySet<string>; complete: boolean }> {
  const result = await execGit(
    ['rev-list', `--max-count=${UNPUSHED_SET_CAP}`, ...range],
    {
      cwd: repoPath,
      // A range git cannot resolve (an empty repository, a fallback whose
      // exclusions name nothing) is an unanswered question, not a failed one,
      // and losing the badges must not take the history list down with it.
      successExitCodes: new Set([0, 1, 128]),
      timeoutMs: 30_000
    }
  )
  if (result.exitCode !== 0) return { shas: new Set<string>(), complete: false }
  const shas = result.stdout.split(/\r?\n/).filter(line => line.length > 0)
  return { shas: new Set(shas), complete: shas.length < UNPUSHED_SET_CAP }
}

function positiveInt(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const int = Math.floor(value)
  return int > 0 ? int : undefined
}
