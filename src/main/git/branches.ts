import type { BranchInfo } from '../../shared/models'
import { execGit } from './exec'
import { getStatus } from './status'

export async function getBranches(repoPath: string): Promise<BranchInfo[]> {
  const [forEachRef, status] = await Promise.all([
    execGit(
      [
        'for-each-ref',
        '--format=%(refname:short)\t%(objectname)',
        'refs/heads/'
      ],
      { cwd: repoPath, timeoutMs: 15_000 }
    ),
    getStatus(repoPath)
  ])

  return forEachRef.stdout
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(line => {
      const [name, head] = line.split('\t')
      return { name, head, current: name === status.branch }
    })
    .filter(b => b.name.length > 0)
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export async function checkoutBranch(
  repoPath: string,
  name: string
): Promise<void> {
  await execGit(['checkout', '--end-of-options', name], {
    cwd: repoPath,
    timeoutMs: 30_000
  })
}

export async function createBranch(
  repoPath: string,
  name: string
): Promise<void> {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('Branch name cannot be empty.')
  }
  await execGit(['checkout', '-b', trimmed], {
    cwd: repoPath,
    timeoutMs: 20_000
  })
}
