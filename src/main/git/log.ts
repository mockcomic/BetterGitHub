import type { CommitInfo, LogQuery } from '../../shared/models'
import { execGit } from './exec'

const FIELD_SEP = ''
const RECORD_SEP = ''

const DEFAULT_MAX_COUNT = 300

export async function getLog(
  repoPath: string,
  query: LogQuery = {}
): Promise<CommitInfo[]> {
  const result = await execGit(buildLogArgs(query), {
    cwd: repoPath,
    timeoutMs: 30_000
  })

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
        isMerge: parentList.length > 1
      }
    })
}

/**
 * Builds the `git log` argv. Exposed (and unit-tested) so the paging/search
 * contract stays stable: `--skip` + `--max-count` give "load more", `-i
 * --grep` / `--author` filter case-insensitively.
 */
export function buildLogArgs(query: LogQuery = {}): string[] {
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
  return args
}

function positiveInt(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const int = Math.floor(value)
  return int > 0 ? int : undefined
}
