import type { CommitInfo } from '../../shared/models'
import { execGit } from './exec'

const FIELD_SEP = '\u001f'
const RECORD_SEP = '\u001e'

export async function getLog(
  repoPath: string,
  maxCount = 300
): Promise<CommitInfo[]> {
  const format = [
    '%H',
    '%P',
    '%an',
    '%ae',
    '%aI',
    '%s',
    '%B'
  ].join(FIELD_SEP)

  const result = await execGit(
    [
      'log',
      `--max-count=${maxCount}`,
      `--format=${format}${RECORD_SEP}`
    ],
    { cwd: repoPath, timeoutMs: 30_000 }
  )

  return result.stdout
    .split(RECORD_SEP)
    .map(r => r.replace(/^\n+/, ''))
    .filter(r => r.trim().length > 0)
    .map(record => {
      const fields = record.split(FIELD_SEP)
      const [sha, parents, authorName, authorEmail, date, summary, body] = fields
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
