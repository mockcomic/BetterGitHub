import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { execGit } from '../src/main/git/exec'
import { getStatus } from '../src/main/git/status'
import { getLog } from '../src/main/git/log'
import { cloneRepository, push } from '../src/main/git/sync'
import {
  checkoutBranch,
  createBranch,
  deleteBranch,
  getBranches,
  mergeBranch,
  renameBranch
} from '../src/main/git/branches'
import {
  amendCommit,
  cherryPickCommit,
  commitPaths,
  revertCommit,
  uncommitCommit,
  undoLastCommit
} from '../src/main/git/commit'
import {
  applyStash,
  dropStash,
  getStashDiff,
  listStashes,
  popStash,
  setStashMessage,
  stashAll
} from '../src/main/git/stash'
import { resolveConflict, stagePaths, unstagePaths } from '../src/main/git/staging'
import { getPathsDiffText } from '../src/main/git/diff'
import { abortOperation, continueOperation } from '../src/main/git/workflow'
import { appendGitignoreRules, gitignoreRuleFor } from '../src/main/git/ignore'

/**
 * Integration coverage for the git verb modules: runs the real `git` binary in
 * a throwaway repository, which is what catches wrong argv. Requires git on
 * PATH (a documented app requirement); if it is missing, beforeAll fails loud.
 */

let repo = ''
let origin = ''

function git(args: ReadonlyArray<string>): Promise<string> {
  return execGit(args, { cwd: repo, timeoutMs: 30_000 }).then(r =>
    (r.stdout + r.stderr).trim()
  )
}

function write(path: string, content: string): void {
  writeFileSync(join(repo, ...path.split('/')), content, 'utf8')
}

/** Discards every leftover change so each test starts from a clean tree. */
async function resetClean(): Promise<void> {
  // -x too: ignored files would otherwise survive a clean and confuse counts.
  await execGit(['reset', '--quiet', '.'], { cwd: repo })
  await execGit(['checkout', '--quiet', '.'], { cwd: repo })
  await execGit(['clean', '-qfdx'], { cwd: repo })
  expect((await getStatus(repo)).files).toHaveLength(0)
}

async function commitAll(message: string): Promise<string> {
  await execGit(['add', '-A'], { cwd: repo })
  await execGit(['commit', '--quiet', '--no-verify', '--allow-empty', '-m', message], {
    cwd: repo
  })
  return (await execGit(['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()
}

beforeAll(async () => {
  // Isolate from the developer's global/system config and hooks.
  process.env['GIT_CONFIG_GLOBAL'] = join(tmpdir(), 'aspen-it-no-global-config')
  process.env['GIT_CONFIG_SYSTEM'] = join(tmpdir(), 'aspen-it-no-system-config')

  repo = mkdtempSync(join(tmpdir(), 'aspen-it-'))
  origin = mkdtempSync(join(tmpdir(), 'aspen-origin-'))

  await git(['init', '--initial-branch=main', '--quiet', repo])
  await git(['init', '--bare', '--quiet', origin])
  await git(['config', 'user.name', 'Test Author'])
  await git(['config', 'user.email', 'test@example.com'])
  await git(['config', 'commit.gpgsign', 'false'])
  await git(['config', 'core.autocrlf', 'false'])
  await git(['remote', 'add', 'origin', origin])

  write('README.md', '# hello\n')
  await commitAll('initial commit')
})

describe('git integration', () => {
  it('reports branch, oid, flags and file status', async () => {
    const status = await getStatus(repo)
    expect(status.branch).toBe('main')
    expect(status.oid).toHaveLength(40)
    expect(status.conflictCount).toBe(0)
    expect(status.inProgress).toEqual({
      merge: false,
      rebase: false,
      cherryPick: false,
      revert: false
    })

    write('README.md', '# hello world\n')
    const dirty = await getStatus(repo)
    expect(dirty.files.map(f => f.path)).toContain('README.md')
    expect(dirty.files.find(f => f.path === 'README.md')).toMatchObject({
      kind: 'modified',
      staged: false,
      hasWorktreeChanges: true,
      untracked: false
    })
    await resetClean()
  })

  it('commits exactly the selected files when nothing is staged', async () => {
    write('README.md', '# hello world\n')
    write('notes.txt', 'unrelated\n')
    const sha = await commitPaths(repo, 'Update readme', 'More detail.', [
      'README.md'
    ])
    expect(sha).toHaveLength(40)
    const shown = await git(['show', '--name-only', '--format=', sha])
    expect(shown).toContain('README.md')
    expect(shown).not.toContain('notes.txt')
    const body = (await git(['log', '-1', '--format=%B', sha])).trim()
    expect(body.startsWith('Update readme')).toBe(true)
    expect(body).toContain('More detail.')

    // The unselected file is still dirty.
    expect((await getStatus(repo)).files.map(f => f.path)).toContain('notes.txt')
    await resetClean()
  })

  it('commits the staged baseline even when nothing is selected', async () => {
    write('base.txt', 'staged baseline\n')
    write('passenger.txt', 'not in this commit\n')
    await stagePaths(repo, ['base.txt'])
    const sha = await commitPaths(repo, 'Baseline commit', '', [], ['base.txt'])
    const shown = await git(['show', '--name-only', '--format=', sha])
    expect(shown).toContain('base.txt')
    expect(shown).not.toContain('passenger.txt')
    await resetClean()
  })

  it('merges the staged baseline and the selected files into one commit', async () => {
    write('basetwo.txt', 'staged baseline two\n')
    write('ticked.txt', 'checked only\n')
    await stagePaths(repo, ['basetwo.txt'])
    const sha = await commitPaths(
      repo,
      'Baseline plus selection',
      '',
      ['ticked.txt'],
      ['basetwo.txt']
    )
    const shown = await git(['show', '--name-only', '--format=', sha])
    expect(shown).toContain('basetwo.txt')
    expect(shown).toContain('ticked.txt')
    await resetClean()
  })

  it('keeps the unstaged remainder of a partially staged baseline file', async () => {
    write('half.txt', 'staged part\n')
    await stagePaths(repo, ['half.txt'])
    write('half.txt', 'staged part\nplus an unstaged hunk\n')
    const sha = await commitPaths(repo, 'Staged content only', '', [], ['half.txt'])
    const body = await git(['show', '--format=', sha])
    expect(body).toContain('staged part')
    expect(body).not.toContain('unstaged hunk')
    const dirty = (await getStatus(repo)).files.find(f => f.path === 'half.txt')
    expect(dirty?.staged).toBe(false)
    expect(dirty?.hasWorktreeChanges).toBe(true)
    await resetClean()
  })

  it('refuses to commit when nothing is staged or selected', async () => {
    write('idle.txt', 'dirty but unmentioned\n')
    await expect(
      commitPaths(repo, 'Nothing here', '', [], [])
    ).rejects.toThrow(/Nothing to commit/)
    await resetClean()
  })

  it('amends the tip commit message and content', async () => {
    const before = await git(['rev-parse', 'HEAD'])
    write('extra.txt', 'added by amend\n')
    const after = await amendCommit(repo, 'Update readme (amended)', '', ['extra.txt'])
    expect(after).not.toBe(before)
    expect(await git(['log', '-1', '--format=%s'])).toBe('Update readme (amended)')
    expect(await git(['rev-parse', 'HEAD'])).toBe(after)
    const shown = await git(['show', '--name-only', '--format=', after])
    expect(shown).toContain('extra.txt')
    await commitAll('amend base checkpoint')
  })

  it('undoes the last commit, keeping changes staged', async () => {
    write('notes.txt', 'work\n')
    const sha = await commitPaths(repo, 'Temporary commit', '', ['notes.txt'])
    expect(await undoLastCommit(repo, sha)).toBe(sha)

    const head = await git(['rev-parse', 'HEAD'])
    expect(head).not.toBe(sha)
    const notes = (await getStatus(repo)).files.find(f => f.path === 'notes.txt')
    expect(notes).toBeDefined()
    expect(notes?.staged).toBe(true)
    // The content survived the undo.
    expect(readFileSync(join(repo, 'notes.txt'), 'utf8')).toBe('work\n')
    await resetClean()
  })

  it('refuses to undo a moved tip or a root commit', async () => {
    const head = await git(['rev-parse', 'HEAD'])
    await expect(
      undoLastCommit(repo, 'ffffffffffffffffffffffffffffffffffffffff')
    ).rejects.toThrow(/no longer be undone/)
    expect(await git(['rev-parse', 'HEAD'])).toBe(head)

    const orphan = mkdtempSync(join(tmpdir(), 'aspen-root-'))
    await execGit(['init', '--initial-branch=main', '--quiet', orphan], { cwd: orphan })
    await execGit(['config', 'user.name', 'T'], { cwd: orphan })
    await execGit(['config', 'user.email', 't@example.com'], { cwd: orphan })
    writeFileSync(join(orphan, 'a.txt'), 'a\n', 'utf8')
    await execGit(['add', '-A'], { cwd: orphan })
    await execGit(['commit', '--quiet', '-m', 'root'], { cwd: orphan })
    const rootSha = (await execGit(['rev-parse', 'HEAD'], { cwd: orphan })).stdout.trim()
    await expect(undoLastCommit(orphan, rootSha)).rejects.toThrow(/first commit/)
  })

  it('refuses to uncommit a merge commit', async () => {
    await git(['checkout', '-q', 'main'])
    await resetClean()
    await git(['checkout', '-q', '-b', 'undo-merge'])
    write('undo-side.txt', 'side\n')
    await commitAll('undo merge feature')
    await git(['checkout', '-q', 'main'])
    write('undo-main.txt', 'main\n')
    await commitAll('undo merge main')
    await mergeBranch(repo, 'undo-merge')
    const [tip] = await getLog(repo, { maxCount: 1 })
    expect(tip?.isMerge).toBe(true)

    await expect(undoLastCommit(repo, tip?.sha ?? '')).rejects.toThrow(
      /merge commit/i
    )
    // The refusal must leave the merge untouched at the tip.
    expect(await git(['rev-parse', 'HEAD'])).toBe(tip?.sha)
    await git(['branch', '-D', 'undo-merge'])
  })

  describe('uncommitCommit', () => {
    /** A branch with `a`, `b`, `c` commits on top of main, returning the SHAs. */
    async function seedBranch(name: string): Promise<[string, string, string]> {
      await git(['checkout', '-q', 'main'])
      await resetClean()
      await git(['checkout', '-q', '-b', name])
      write(`${name}-a.txt`, 'a\n')
      const a = await commitAll(`uc ${name} first`)
      write(`${name}-b.txt`, 'b\n')
      const b = await commitAll(`uc ${name} second`)
      write(`${name}-c.txt`, 'c\n')
      const c = await commitAll(`uc ${name} third`)
      return [a, b, c]
    }

    async function cleanUpBranches(...names: string[]): Promise<void> {
      await git(['checkout', '-q', 'main'])
      await resetClean()
      await git(['branch', '-D', ...names])
    }

    it('drops an older commit, replays descendants and restages its changes', async () => {
      const [a, b, c] = await seedBranch('uc-mid')
      await uncommitCommit(repo, b)

      const log = await getLog(repo, { maxCount: 20 })
      const summaries = log.map(entry => entry.summary)
      expect(summaries[0]).toBe('uc uc-mid third')
      expect(summaries).not.toContain('uc uc-mid second')
      expect(summaries).toContain('uc uc-mid first')
      // The descendant was rewritten, so its SHA changed while the untouched
      // ancestor stayed exactly where it was.
      const head = await git(['rev-parse', 'HEAD'])
      expect(head).not.toBe(c)
      expect(summaries.indexOf('uc uc-mid first')).toBe(1)
      expect(
        (await git(['rev-list', '--parents', '-n', '1', head])).split(/\s+/)[1]
      ).toBe(a)

      // The dropped commit's changes are staged for the commit box again…
      const status = await getStatus(repo)
      const restaged = status.files.find(f => f.path === 'uc-mid-b.txt')
      expect(restaged?.staged).toBe(true)
      expect(readFileSync(join(repo, 'uc-mid-b.txt'), 'utf8')).toBe('b\n')
      // …and nothing else reads as dirty.
      expect(status.files.map(f => f.path)).toEqual(['uc-mid-b.txt'])

      await cleanUpBranches('uc-mid')
      expect(existsSync(join(repo, 'uc-mid-b.txt'))).toBe(false)
    })

    it('treats a selected tip like the guarded soft reset, even with a dirty tree', async () => {
      const [, b, c] = await seedBranch('uc-tip')
      // Extra uncommitted work — the soft-reset path must not touch it.
      write('uc-tip-dirty.txt', 'dirty\n')

      await uncommitCommit(repo, c)
      expect(await git(['rev-parse', 'HEAD'])).toBe(b)
      const status = await getStatus(repo)
      expect(status.files.find(f => f.path === 'uc-tip-c.txt')?.staged).toBe(true)
      expect(status.files.find(f => f.path === 'uc-tip-dirty.txt')).toBeDefined()

      await cleanUpBranches('uc-tip')
    })

    it('refuses merges, roots, unknown commits and commits from other branches', async () => {
      const [, b] = await seedBranch('uc-refuse')
      await git(['checkout', '-q', 'main'])
      // Make the merge a real merge: main must have diverged.
      write('uc-refuse-feature.txt', 'feature\n')
      await commitAll('uc refuse feature')
      await mergeBranch(repo, 'uc-refuse')
      const [tip] = await getLog(repo, { maxCount: 1 })
      expect(tip?.isMerge).toBe(true)

      // A merge commit tip is refused by the delegated guarded undo, and its
      // root parent cannot be uncommitted either.
      await expect(uncommitCommit(repo, tip?.sha ?? '')).rejects.toThrow(
        /This is a merge commit/
      )
      const root = (await git(['rev-list', '--max-parents=0', 'HEAD'])).split(/\s+/)[0]
      await expect(uncommitCommit(repo, root)).rejects.toThrow(
        /first commit in the repository/
      )
      await expect(
        uncommitCommit(repo, 'ffffffffffffffffffffffffffffffffffffffff')
      ).rejects.toThrow(/no longer exists in this repository/)

      // A commit that exists but is not in the checked-out branch's history —
      // true again once the merge above is reset away.
      await git(['reset', '--quiet', '--hard', 'HEAD^'])
      await expect(uncommitCommit(repo, b)).rejects.toThrow(
        /not in the current branch/
      )

      await cleanUpBranches('uc-refuse')
    })

    it('refuses an older commit while the tree is dirty', async () => {
      const [, b] = await seedBranch('uc-dirty')
      const head = await git(['rev-parse', 'HEAD'])
      write('uc-dirty-work.txt', 'uncommitted\n')
      await expect(uncommitCommit(repo, b)).rejects.toThrow(
        /Commit or stash your local changes before uncommitting/
      )
      expect(await git(['rev-parse', 'HEAD'])).toBe(head)
      await cleanUpBranches('uc-dirty')
    })

    it('refuses when a later merge would be flattened', async () => {
      const [, b, c] = await seedBranch('uc-flat')
      await git(['checkout', '-q', 'main'])
      write('uc-flat-feature.txt', 'feature\n')
      await commitAll('uc flat feature')
      await git(['checkout', '-q', 'uc-flat'])
      await mergeBranch(repo, 'main')

      await expect(uncommitCommit(repo, b)).rejects.toThrow(
        /later merge commit is built on this one/
      )
      // Untouched: still the merge on top of the original third commit.
      expect((await getLog(repo, { maxCount: 1 }))[0]?.isMerge).toBe(true)
      expect(
        (await getLog(repo, { maxCount: 5 })).map(entry => entry.summary)
      ).toContain('uc uc-flat second')
      expect(c).toHaveLength(40)
      await cleanUpBranches('uc-flat')
    })

    it('rolls back untouched when a later commit conflicts with the removal', async () => {
      await git(['checkout', '-q', 'main'])
      await resetClean()
      await git(['checkout', '-q', '-b', 'uc-conf'])
      write('shared.txt', 'base\n')
      await commitAll('uc conf base')
      write('shared.txt', 'first\n')
      const dropped = await commitAll('uc conf middle')
      write('shared.txt', 'second\n')
      const head = await commitAll('uc conf top')

      await expect(uncommitCommit(repo, dropped)).rejects.toThrow(
        /conflict with removing this commit, so it was left in history/
      )
      expect(await git(['rev-parse', 'HEAD'])).toBe(head)
      const status = await getStatus(repo)
      expect(status.files).toHaveLength(0)
      expect(status.inProgress).toEqual({
        merge: false,
        rebase: false,
        cherryPick: false,
        revert: false
      })
      expect(readFileSync(join(repo, 'shared.txt'), 'utf8')).toBe('second\n')
      await cleanUpBranches('uc-conf')
    })
  })

  it('reverts a commit and refuses merge commits', async () => {
    write('revertme.txt', 'content\n')
    const sha = await commitPaths(repo, 'Add revertme', '', ['revertme.txt'])
    expect(existsSync(join(repo, 'revertme.txt'))).toBe(true)

    await revertCommit(repo, sha)
    expect(existsSync(join(repo, 'revertme.txt'))).toBe(false)
    expect((await git(['log', '-1', '--format=%s'])).toLowerCase()).toContain('revert')

    await git(['checkout', '-q', '-b', 'side'])
    write('side.txt', 'side\n')
    await commitAll('side commit')
    await git(['checkout', '-q', 'main'])
    write('mainline.txt', 'main\n')
    await commitAll('main commit')
    await git(['merge', '--no-edit', '--no-ff', 'side'])
    const mergeSha = (await git(['rev-parse', 'HEAD'])).trim()
    expect((await git(['rev-list', '--parents', '-n', '1', mergeSha])).split(/\s+/)).toHaveLength(3)
    await expect(revertCommit(repo, mergeSha)).rejects.toThrow(/merge commit/)
    await resetClean()
  })

  it('cherry-picks a commit onto another branch', async () => {
    await git(['checkout', '-q', 'main'])
    write('picked.txt', 'picked\n')
    const sha = await commitPaths(repo, 'Pick me', '', ['picked.txt'])
    await git(['checkout', '-q', 'side'])
    await cherryPickCommit(repo, sha)
    expect(readFileSync(join(repo, 'picked.txt'), 'utf8')).toBe('picked\n')
    await git(['checkout', '-q', 'main'])
    await resetClean()
  })

  it('finishes a conflicted cherry-pick through continueOperation', async () => {
    await resetClean()
    write('cp.txt', 'base\n')
    await commitAll('cp base')
    await git(['checkout', '-q', '-b', 'cp-src'])
    write('cp.txt', 'theirs\n')
    await commitAll('cp theirs')
    const sha = (await git(['rev-parse', 'HEAD'])).trim()
    await git(['checkout', '-q', 'main'])
    write('cp.txt', 'ours\n')
    await commitAll('cp ours')

    await expect(cherryPickCommit(repo, sha)).rejects.toThrow(/cherry-pick/)
    const conflicted = await getStatus(repo)
    expect(conflicted.conflictCount).toBe(1)
    expect(conflicted.inProgress.cherryPick).toBe(true)
    expect(conflicted.inProgress.revert).toBe(false)

    // Continue refuses until the conflict is resolved.
    await expect(continueOperation(repo, 'cherryPick')).rejects.toThrow(
      /Resolve all 1 conflicted file/
    )

    write('cp.txt', 'hand merged\n')
    await resolveConflict(repo, 'cp.txt', 'resolved')
    expect((await getStatus(repo)).conflictCount).toBe(0)

    await continueOperation(repo, 'cherryPick')
    const done = await getStatus(repo)
    expect(done.inProgress.cherryPick).toBe(false)
    expect(done.files).toHaveLength(0)
    expect(readFileSync(join(repo, 'cp.txt'), 'utf8')).toBe('hand merged\n')
    await resetClean()
  })

  it('stashes untracked work, then applies, pops and drops', async () => {
    write('tracked.txt', 'work in progress\n')
    write('untracked-new.txt', 'fresh\n')
    expect((await getStatus(repo)).files).toHaveLength(2)

    await stashAll(repo, 'my work')
    expect((await getStatus(repo)).files).toHaveLength(0)
    expect(existsSync(join(repo, 'untracked-new.txt'))).toBe(false)

    const listed = await listStashes(repo)
    expect(listed).toHaveLength(1)
    expect(listed[0].message).toContain('my work')
    expect(listed[0].branch).toBe('main')
    expect(listed[0].label).toBe('stash@{0}')

    // apply keeps the entry…
    await applyStash(repo, 0)
    expect((await getStatus(repo)).files).toHaveLength(2)
    expect(await listStashes(repo)).toHaveLength(1)
    await resetClean()
    expect((await getStatus(repo)).files).toHaveLength(0)

    // …while pop removes it.
    await popStash(repo, 0)
    expect((await getStatus(repo)).files).toHaveLength(2)
    expect(await listStashes(repo)).toHaveLength(0)
    await resetClean()

    // A stash with no message gets a generated one; drop discards it.
    write('discardme.txt', 'x\n')
    await stashAll(repo)
    expect((await getStatus(repo)).files).toHaveLength(0)
    const auto = await listStashes(repo)
    expect(auto).toHaveLength(1)
    expect(auto[0].message).toContain('Aspen on main')
    await dropStash(repo, 0)
    expect(await listStashes(repo)).toHaveLength(0)
    expect((await getStatus(repo)).files).toHaveLength(0)
  })

  it('stores a subject+body message, rewrites it, and can diff the entry', async () => {
    await resetClean()
    write('body-check.txt', 'v1\n')
    await commitAll('add body-check')
    write('body-check.txt', 'v2\n')

    // A multi-line -m lands as subject + body on the stash commit. git
    // prefixes the subject with `On <branch>: ` and flattens the *whole*
    // message into %gs — %s/%b are what keep subject and body apart.
    await stashAll(repo, 'park the edit\n\nRaises body-check to v2.')
    let listed = await listStashes(repo)
    expect(listed).toHaveLength(1)
    expect(listed[0].message).toBe('On main: park the edit')
    expect(listed[0].description).toBe('Raises body-check to v2.')
    expect(listed[0].branch).toBe('main')

    // The entry's stored diff is visible for the AI summarizer.
    const diff = await getStashDiff(repo, 0)
    expect(diff).toContain('-v1')
    expect(diff).toContain('+v2')

    // Rewriting keeps the changes, the entry's original date and the list
    // size; later indices shift during the rebuild+drop but settle back to
    // the original layout.
    const originalDate = (await listStashes(repo))[0].date
    write('second.txt', 'x\n')
    await stashAll(repo, 'second entry')
    expect((await listStashes(repo))).toHaveLength(2)
    await setStashMessage(repo, 1, 'park the edit, take two', 'Same changes.', 'main')
    listed = await listStashes(repo)
    expect(listed).toHaveLength(2)
    const retitled = listed.find(s =>
      s.message.includes('park the edit, take two')
    )
    expect(retitled).toBeDefined()
    expect(retitled?.description).toBe('Same changes.')
    expect(retitled?.branch).toBe('main')
    // commit-tree replays the original author/committer stamps, so the
    // entry still reads as stashed when it was stashed.
    expect(retitled?.date).toBe(originalDate)
    // The re-entered stash still carries the v2 edit.
    expect(retitled && (await getStashDiff(repo, retitled.index))).toContain('+v2')

    await dropStash(repo, 0)
    await dropStash(repo, 0)
    expect(await listStashes(repo)).toHaveLength(0)
    // The dropped entries were the only holders of the v2 edit; the file on
    // disk never saw it.
    expect(readFileSync(join(repo, 'body-check.txt'), 'utf8')).toBe('v1\n')
    await resetClean()
  })

  it('refuses to stash mid-merge and can abort the merge', async () => {
    await resetClean()
    write('conflict.txt', 'base\n')
    await commitAll('conflict base')
    await git(['checkout', '-q', '-b', 'conf'])
    write('conflict.txt', 'theirs\n')
    await commitAll('conflict theirs')
    await git(['push', '-q', 'origin', 'conf'])
    await git(['checkout', '-q', 'main'])
    write('conflict.txt', 'ours\n')
    await commitAll('conflict ours')

    await execGit(['merge', '--no-commit', 'conf'], {
      cwd: repo,
      timeoutMs: 30_000,
      successExitCodes: new Set([0, 1])
    })

    const conflicted = await getStatus(repo)
    expect(conflicted.conflictCount).toBe(1)
    expect(conflicted.inProgress.merge).toBe(true)
    expect(conflicted.files.find(f => f.path === 'conflict.txt')?.kind).toBe('conflicted')
    await expect(stashAll(repo, 'nope')).rejects.toThrow(/conflicted/)

    await abortOperation(repo, 'merge')
    const after = await getStatus(repo)
    expect(after.inProgress.merge).toBe(false)
    expect(after.conflictCount).toBe(0)
    expect(readFileSync(join(repo, 'conflict.txt'), 'utf8')).toBe('ours\n')
  })

  it('resolves with one side and continues the merge', async () => {
    await resetClean()
    await execGit(['merge', '--no-commit', 'conf'], {
      cwd: repo,
      timeoutMs: 30_000,
      successExitCodes: new Set([0, 1])
    })
    expect((await getStatus(repo)).conflictCount).toBe(1)

    await resolveConflict(repo, 'conflict.txt', 'ours')
    expect(readFileSync(join(repo, 'conflict.txt'), 'utf8')).toBe('ours\n')
    expect((await getStatus(repo)).conflictCount).toBe(0)

    await continueOperation(repo, 'merge')
    const done = await getStatus(repo)
    expect(done.inProgress.merge).toBe(false)
    expect(done.files).toHaveLength(0)
    expect(readFileSync(join(repo, 'conflict.txt'), 'utf8')).toBe('ours\n')
  })

  it('lists local and remote branches and tracks a remote one', async () => {
    await git(['push', '-q', '--set-upstream', 'origin', 'main'])
    const list = await getBranches(repo)
    expect(list.local.map(b => b.name)).toEqual(
      expect.arrayContaining(['main', 'conf', 'side'])
    )
    expect(list.local.find(b => b.current)?.name).toBe('main')
    const remoteNames = list.remote.map(b => `${b.remote}/${b.name}`)
    expect(remoteNames).toEqual(expect.arrayContaining(['origin/conf', 'origin/main']))
    expect(list.remote.every(b => b.remote === 'origin')).toBe(true)
    expect(list.remote.map(b => b.name)).not.toContain('HEAD')

    // A remote branch with no local counterpart becomes a tracking branch.
    await git(['branch', '-D', 'conf'])
    await checkoutBranch(repo, 'conf', 'origin')
    const status = await getStatus(repo)
    expect(status.branch).toBe('conf')
    expect(status.upstream).toBe('origin/conf')
    await git(['checkout', '-q', 'main'])
  })

  it('reports ahead/behind of every branch against HEAD and its upstream', async () => {
    await resetClean()
    await git(['checkout', '-q', 'main'])

    // Move main forward so older refs are strictly behind it.
    write('divergence.txt', 'main moves\n')
    await commitAll('branch divergence: main moves')
    const tip = (await execGit(['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()
    await git(['branch', 'behind-one', `${tip}^`])

    // ahead-one: two local commits on top of main, pushed after the first,
    // so its upstream is one commit behind it.
    await git(['checkout', '-q', '-b', 'ahead-one'])
    write('ahead.txt', 'ahead\n')
    await commitAll('branch divergence: ahead 1')
    await git(['push', '-q', '--set-upstream', 'origin', 'ahead-one'])
    write('ahead2.txt', 'ahead more\n')
    await commitAll('branch divergence: ahead 2')
    await git(['checkout', '-q', 'main'])

    const list = await getBranches(repo)
    const current = list.local.find(b => b.current)
    const ahead = list.local.find(b => b.name === 'ahead-one')
    const behind = list.local.find(b => b.name === 'behind-one')
    const remoteRow = list.remote.find(
      b => b.remote === 'origin' && b.name === 'ahead-one'
    )

    expect(current?.name).toBe('main')
    // The checked-out branch is never measured against itself.
    expect(current?.ahead).toBeUndefined()
    expect(current?.behind).toBeUndefined()
    // main tracks origin/main and this test moved it one commit ahead.
    expect(current?.upstream).toBe('origin/main')
    expect(current?.upstreamAhead).toBe(1)
    expect(current?.upstreamBehind).toBe(0)

    expect(ahead).toMatchObject({ ahead: 2, behind: 0 })
    expect(behind).toMatchObject({ ahead: 0, behind: 1 })
    // The remote-tracking ref was pushed before the second ahead commit.
    expect(remoteRow).toMatchObject({ ahead: 1, behind: 0 })

    // Upstream tracking state rides along independently of vs-current.
    expect(ahead?.upstream).toBe('origin/ahead-one')
    expect(ahead?.upstreamAhead).toBe(1)
    expect(ahead?.upstreamBehind).toBe(0)
    expect(behind?.upstream).toBeUndefined()
    expect(behind?.upstreamAhead).toBeUndefined()

    // Detached HEAD: vs-current divergence has no anchor, so no row carries it
    // (upstream tracking state still parses, as it needs no HEAD).
    await git(['checkout', '-q', '--detach', 'HEAD'])
    const detached = await getBranches(repo)
    expect(
      detached.local.every(b => b.ahead === undefined && b.behind === undefined)
    ).toBe(true)
    expect(
      detached.remote.every(b => b.ahead === undefined && b.behind === undefined)
    ).toBe(true)
    await git(['checkout', '-q', 'main'])

    // A repository without commits must simply list (no refs exist yet, and
    // nothing may run a rev-list against the unborn HEAD).
    const fresh = mkdtempSync(join(tmpdir(), 'aspen-unborn-'))
    await execGit(['init', '--initial-branch=main', '--quiet', fresh], {
      cwd: fresh
    })
    expect(await getBranches(fresh)).toEqual({ local: [], remote: [] })

    // Leave the shared repo as we found it.
    await git(['push', '-q', 'origin', '--delete', 'ahead-one'])
    await git(['branch', '-D', 'ahead-one', 'behind-one'])
    await git(['update-ref', '-d', 'refs/remotes/origin/ahead-one'])
  })

  it('names a deleted upstream instead of reporting the branch in sync', async () => {
    await git(['checkout', '-q', '-b', 'stranded'])
    await commitAll('work on a branch that will be stranded')
    await git(['push', '-q', '--set-upstream', 'origin', 'stranded'])

    // Tracked, in sync, and the ref is genuinely there: the probe answers no.
    const tracked = await getStatus(repo)
    expect(tracked.upstream).toBe('origin/stranded')
    expect(tracked.ahead).toBe(0)
    expect(tracked.behind).toBe(0)
    expect(tracked.upstreamGone).toBe(false)

    // Someone else deletes the branch and the remote-tracking ref goes with it
    // (a `fetch --prune`). git still reports +0 -0, which alone would read as
    // a branch at peace.
    await git(['update-ref', '-d', 'refs/remotes/origin/stranded'])
    const gone = await getStatus(repo)
    expect(gone.upstream).toBe('origin/stranded')
    expect(gone.ahead).toBe(0)
    expect(gone.behind).toBe(0)
    expect(gone.upstreamGone).toBe(true)

    // The branch list says the same thing, from `%(upstream:track)`.
    const listed = await getBranches(repo)
    expect(listed.local.find(b => b.name === 'stranded')?.upstreamGone).toBe(true)

    // Re-establish the ref: an in-sync branch is not a gone one again.
    await git(['push', '-q', '--set-upstream', 'origin', 'stranded'])
    expect((await getStatus(repo)).upstreamGone).toBe(false)

    await git(['checkout', '-q', 'main'])
    await git(['push', '-q', 'origin', '--delete', 'stranded'])
    await git(['branch', '-D', 'stranded'])
    await git(['update-ref', '-d', 'refs/remotes/origin/stranded'])
  })

  it('guards branch deletion and supports rename', async () => {
    await expect(deleteBranch(repo, 'main', false)).rejects.toThrow(/Switch to another branch/)

    await git(['checkout', '-q', '-b', 'scratch'])
    write('scratch.txt', 'only here\n')
    await commitAll('scratch commit')
    await git(['checkout', '-q', 'main'])
    await expect(deleteBranch(repo, 'scratch', false)).rejects.toThrow(/not fully merged|not yet merged/i)
    await deleteBranch(repo, 'scratch', true)
    expect((await getBranches(repo)).local.map(b => b.name)).not.toContain('scratch')

    await git(['checkout', '-q', '-b', 'rename-me'])
    await renameBranch(repo, 'rename-me', 'renamed-ok')
    expect((await getStatus(repo)).branch).toBe('renamed-ok')
    await git(['checkout', '-q', 'main'])
  })

  it('pages and filters the log', async () => {
    const all = await getLog(repo, { maxCount: 100 })
    expect(all.length).toBeGreaterThan(3)
    expect(all[all.length - 1].summary).toBe('initial commit')
    expect(all[all.length - 1].parents).toHaveLength(0)
    expect(all[all.length - 1].body).toBe('')

    const first = all.slice(0, 2)
    const paged = await getLog(repo, { maxCount: 2, skip: 2 })
    expect(paged).toHaveLength(2)
    expect(paged[0].sha).not.toBe(first[0].sha)

    const found = await getLog(repo, { search: 'readme' })
    expect(found.length).toBeGreaterThan(0)
    for (const c of found) expect(c.summary.toLowerCase()).toContain('readme')

    const mine = await getLog(repo, { author: 'test@example.com' })
    expect(mine).toHaveLength(all.length)
    expect(await getLog(repo, { author: 'nobody@nowhere.test' })).toHaveLength(0)

    const mergeCommit = all.find(c => c.isMerge)
    expect(mergeCommit).toBeDefined()
    expect(mergeCommit?.parents).toHaveLength(2)
  })

  describe('unpushed log', () => {
    /**
     * Branch `branch` with one commit the remote has, then `count` commits it
     * does not. Returns the outgoing SHAs oldest first, so a newest-first log
     * answer is that list reversed.
     */
    async function seedOutgoing(
      branch: string,
      count: number
    ): Promise<string[]> {
      await resetClean()
      await git(['checkout', '-q', 'main'])
      await git(['checkout', '-q', '-b', branch])
      write(`${branch}-base.txt`, 'base\n')
      await commitAll(`out ${branch} pushed`)
      await git(['push', '-q', '--set-upstream', 'origin', branch])
      const shas: string[] = []
      for (let i = 0; i < count; i++) {
        write(`${branch}-out-${i}.txt`, `${i}\n`)
        shas.push(await commitAll(`out ${branch} waiting ${i}`))
      }
      return shas
    }

    async function cleanUpOutgoing(branch: string): Promise<void> {
      // Clear the worktree first: `checkout main` refuses to carry staged
      // changes over, and a case may leave exactly that behind.
      await resetClean()
      await git(['checkout', '-q', 'main'])
      // All three deletes tolerate "already gone": this runs as a sweep before
      // every case too, so a failed assertion cannot strand a branch, its
      // remote ref, or the HEAD of the tests that follow.
      await execGit(['push', '-q', 'origin', '--delete', branch], {
        cwd: repo,
        successExitCodes: new Set([0, 1])
      })
      await execGit(['update-ref', '-d', `refs/remotes/origin/${branch}`], {
        cwd: repo,
        successExitCodes: new Set([0, 1])
      })
      await execGit(['branch', '-D', branch], {
        cwd: repo,
        successExitCodes: new Set([0, 1])
      })
    }

    beforeEach(async () => {
      for (const branch of ['unp-range', 'unp-pushed', 'unp-gone']) {
        await cleanUpOutgoing(branch)
      }
    })

    it('lists exactly the commits the ahead count claims', async () => {
      const shas = await seedOutgoing('unp-range', 2)
      const status = await getStatus(repo)
      expect(status.upstream).toBe('origin/unp-range')
      expect(status.ahead).toBe(2)

      const only = await getLog(repo, { maxCount: 50, unpushed: 'only' })
      expect(only.map(c => c.sha)).toEqual([...shas].reverse())
      // Restricting by the range is git's own answer, so its rows are outgoing
      // by construction — no second walk needed to say so.
      expect(only.every(c => c.unpushed)).toBe(true)

      // An unfiltered walk marks the same set, so a row's badge cannot disagree
      // with the pill that counts it.
      const marked = await getLog(repo, { maxCount: 50, unpushed: 'mark' })
      expect(marked.filter(c => c.unpushed).map(c => c.sha)).toEqual(
        [...shas].reverse()
      )
      expect(
        marked.find(c => c.summary === 'out unp-range pushed')?.unpushed
      ).toBe(false)
      expect(marked.find(c => c.summary === 'initial commit')?.unpushed).toBe(
        false
      )

      // A plain query pays nothing for the question it did not ask.
      const plain = await getLog(repo, { maxCount: 50 })
      expect(plain.length).toBeGreaterThanOrEqual(marked.length)
      expect(plain.every(c => c.unpushed === false)).toBe(true)

      await cleanUpOutgoing('unp-range')
    })

    it('empties the list once the work is pushed', async () => {
      await seedOutgoing('unp-pushed', 1)
      await push(repo)
      expect((await getStatus(repo)).ahead).toBe(0)
      expect(await getLog(repo, { maxCount: 50, unpushed: 'only' })).toHaveLength(
        0
      )
      const marked = await getLog(repo, { maxCount: 50, unpushed: 'mark' })
      expect(marked.some(c => c.unpushed)).toBe(false)
      await cleanUpOutgoing('unp-pushed')
    })

    it('keeps the list honest when the tracked ref is gone', async () => {
      await seedOutgoing('unp-gone', 1)
      // The remote branch is deleted and the last-fetched value with it: git
      // now reports +0 -0 against nothing, which would read as an empty list
      // on a desk whose only verb is Publish.
      await git(['push', '-q', 'origin', '--delete', 'unp-gone'])
      await git(['update-ref', '-d', 'refs/remotes/origin/unp-gone'])
      expect((await getStatus(repo)).ahead).toBe(0)

      const only = await getLog(repo, { maxCount: 50, unpushed: 'only' })
      // The fallback range has nothing left to subtract for this branch, so
      // both of its commits are listed — the one the remote did receive
      // included — along with any ancestor of the branch the remote never saw.
      // That is the honest reading of a state with no count: the desk's only
      // verb is Publish, and Publish sends all of it.
      const summaries = only.map(c => c.summary)
      expect(summaries).toContain('out unp-gone waiting 0')
      expect(summaries).toContain('out unp-gone pushed')
      await cleanUpOutgoing('unp-gone')
    })

    it('calls every commit outgoing where no remote carries any', async () => {
      // A repository with a lone commit and no remote at all: the fallback
      // range has nothing to subtract, and "all of it" is the truth.
      const lone = mkdtempSync(join(tmpdir(), 'aspen-lone-'))
      const inLone = (args: ReadonlyArray<string>) =>
        execGit(args, { cwd: lone, timeoutMs: 30_000 })
      await inLone(['init', '--initial-branch=main', '--quiet', '.'])
      await inLone(['config', 'user.name', 'Test Author'])
      await inLone(['config', 'user.email', 'test@example.com'])
      writeFileSync(join(lone, 'only.txt'), 'only\n')
      await inLone(['add', '-A'])
      await inLone(['commit', '--quiet', '-m', 'lone commit'])

      const only = await getLog(lone, { maxCount: 10, unpushed: 'only' })
      expect(only.map(c => c.summary)).toEqual(['lone commit'])
      expect(only[0]?.unpushed).toBe(true)
      rmSync(lone, { recursive: true, force: true })
    })
  })

  it('stages paths and honours .gitignore rules', async () => {
    write('staged.txt', 'x\n')
    await stagePaths(repo, ['staged.txt'])
    expect(
      (await getStatus(repo)).files.find(f => f.path === 'staged.txt')?.staged
    ).toBe(true)
    await resetClean()

    const rule = gitignoreRuleFor('ignored.log', false)
    expect(rule).toBe('ignored.log')
    expect(await appendGitignoreRules(repo, [rule])).toEqual([rule])
    expect(await appendGitignoreRules(repo, ['ignored.log'])).toEqual([])
    const content = readFileSync(join(repo, '.gitignore'), 'utf8')
    expect(content.match(/ignored\.log/g)).toHaveLength(1)

    write('ignored.log', 'noise\n')
    write('keepme.txt', 'kept\n')
    const status = await getStatus(repo)
    expect(status.files.map(f => f.path)).not.toContain('ignored.log')
    expect(status.files.map(f => f.path)).toContain('keepme.txt')

    // A directory rule keeps its trailing slash.
    expect(gitignoreRuleFor('build', true)).toBe('build/')
    await resetClean()
  })

  it('stage-all survives already-staged deletions', async () => {
    // Regression: `git add -A -- <path>` aborts the whole command when a path
    // matches neither the working tree nor the index. A deletion that is
    // already fully staged is exactly that, so a stage-all over the sidebar
    // file list used to fail with "fatal: pathspec … did not match any files"
    // (exit 128) and nothing else got staged.
    await resetClean()
    write('todelete.txt', 'doomed\n')
    write('modified.txt', 'base\n')
    await commitAll('add files for delete regression')

    unlinkSync(join(repo, 'todelete.txt'))
    await execGit(['add', '-A', '--end-of-options', 'todelete.txt'], { cwd: repo })
    write('modified.txt', 'changed\n')

    // Same call shape the renderer's stageAll makes: every status row,
    // including the fully-staged deletion.
    await stagePaths(repo, ['todelete.txt', 'modified.txt'])

    const status = await getStatus(repo)
    const modified = status.files.find(f => f.path === 'modified.txt')
    expect(modified?.staged).toBe(true)
    expect(modified?.worktreeCode).toBe('.')
    expect(status.files.find(f => f.path === 'todelete.txt')?.staged).toBe(true)
    await resetClean()
  })

  it('stage-all self-heals paths git refuses by name', async () => {
    // A file the worktree check lets through but git rejects because it
    // became ignored after the status snapshot (e.g. "Add to .gitignore" ran
    // in between) must not fail the stage: addPaths drops the refused paths
    // and retries so everything else still gets staged.
    await resetClean()
    write('.gitignore', '*.log\n')
    write('keep.txt', 'kept\n')
    await commitAll('seed ignore self-heal')

    write('run.log', 'noise\n') // ignored, but present — passes existsSync
    write('sibling.txt', 'sibling\n')

    await expect(stagePaths(repo, ['run.log', 'sibling.txt'])).resolves.toBeUndefined()

    const status = await getStatus(repo)
    expect(status.files.find(f => f.path === 'sibling.txt')?.staged).toBe(true)
    expect(status.files.map(f => f.path)).not.toContain('run.log')
    await resetClean()
  })

  it('AI diff payload survives paths missing from the working tree', async () => {
    // Regression: Generate batched every checked path into one
    // `git diff HEAD -- <paths>`; a single path the index does not know — a
    // file deleted after the status snapshot (leftover .tmp-dbg-vog probes) —
    // aborted the whole command with "fatal: <path>: no such path in the
    // working tree." (exit 128) and the AI call never ran.
    await resetClean()
    write('README.md', '# hello payload\n')
    write('payload-new.txt', 'fresh content\n')
    mkdirSync(join(repo, '.tmp-probe'))
    write('.tmp-probe/explorer-probe.txt', 'doomed probe\n')

    // Snapshot like generateCommitMessage does, then the probe file vanishes.
    const status = await getStatus(repo)
    const statusByPath = new Map(
      status.files.map(f => [f.path, { untracked: f.untracked, oldPath: f.oldPath }])
    )
    unlinkSync(join(repo, '.tmp-probe', 'explorer-probe.txt'))

    // A ghost path that was never in the snapshot exercises the same guard
    // from the renderer side (stale checkbox for a file long gone).
    const text = await getPathsDiffText(
      repo,
      [...statusByPath.keys(), '.tmp-probe/ghost.txt'],
      statusByPath
    )
    expect(text).toContain('+# hello payload') // tracked modification, batched
    expect(text).toContain('+fresh content') // untracked, synthesized
    expect(text).not.toContain('doomed probe') // vanished path contributes nothing
    await resetClean()
  })

  it('unstages a staged file while keeping its content', async () => {
    write('unstage-me.txt', 'staged content')
    await stagePaths(repo, ['unstage-me.txt'])
    let status = await getStatus(repo)
    expect(status.files.find(f => f.path === 'unstage-me.txt')?.staged).toBe(true)
    await unstagePaths(repo, ['unstage-me.txt'])
    status = await getStatus(repo)
    const entry = status.files.find(f => f.path === 'unstage-me.txt')
    expect(entry?.staged ?? false).toBe(false)
    expect(entry?.untracked).toBe(true)
    expect(readFileSync(join(repo, 'unstage-me.txt'), 'utf8')).toBe('staged content')
    await execGit(['clean', '-fd', '--', 'unstage-me.txt'], { cwd: repo })
  })

  it('creates a branch from a named start point', async () => {
    const head = await execGit(['rev-parse', 'HEAD'], { cwd: repo })
    await createBranch(repo, 'from-start', 'main')
    const nowAt = await execGit(['rev-parse', 'HEAD'], { cwd: repo })
    expect(nowAt.stdout.trim()).toBe(head.stdout.trim())
    await checkoutBranch(repo, 'main')
    await deleteBranch(repo, 'from-start', true)
  })

  it('refuses to amend after the tip moved', async () => {
    write('amend-race.txt', 'v1')
    await stagePaths(repo, ['amend-race.txt'])
    const sha = await commitPaths(repo, 'amend race base', '', ['amend-race.txt'])
    write('other.txt', 'someone else commits')
    await stagePaths(repo, ['other.txt'])
    await commitPaths(repo, 'moved the tip', '', ['other.txt'])
    await expect(
      amendCommit(repo, 'nope', '', [], sha)
    ).rejects.toThrow(/changed since the amend started/)
  })

  describe('mergeBranch', () => {
    it('fast-forwards a branch that is strictly ahead', async () => {
      await git(['checkout', '-q', 'main'])
      await resetClean()
      await git(['checkout', '-q', '-b', 'mgmt-ff'])
      write('mgmt-ff.txt', 'ff\n')
      await commitAll('mgmt ff commit')
      await git(['checkout', '-q', 'main'])
      const output = await mergeBranch(repo, 'mgmt-ff')
      expect(/fast-forward|updating/i.test(output)).toBe(true)
      const log = await getLog(repo, { maxCount: 10 })
      expect(log.some(c => c.summary === 'mgmt ff commit')).toBe(true)
      await git(['branch', '-D', 'mgmt-ff'])
    })

    it('creates a merge commit when the histories diverge', async () => {
      await git(['checkout', '-q', 'main'])
      await resetClean()
      await git(['checkout', '-q', '-b', 'mgmt-div'])
      write('mgmt-div.txt', 'feature\n')
      await commitAll('mgmt diverge feature')
      await git(['checkout', '-q', 'main'])
      write('mgmt-main.txt', 'main\n')
      await commitAll('mgmt diverge main')
      await mergeBranch(repo, 'mgmt-div')
      const [tip] = await getLog(repo, { maxCount: 1 })
      expect(tip?.isMerge).toBe(true)
      expect(tip?.summary).toContain("Merge branch 'mgmt-div'")
      expect((await getStatus(repo)).inProgress.merge).toBe(false)
      await git(['branch', '-D', 'mgmt-div'])
    })

    it('leaves a conflicted merge paused and aborts cleanly', async () => {
      await git(['checkout', '-q', 'main'])
      await resetClean()
      await git(['checkout', '-q', '-b', 'mgmt-conf'])
      write('mgmt-conflict.txt', 'theirs\n')
      await commitAll('mgmt conflict side')
      await git(['checkout', '-q', 'main'])
      write('mgmt-conflict.txt', 'ours\n')
      await commitAll('mgmt conflict ours')
      try {
        // The module rewrites git's truncated first-line error into a
        // "Merge conflict" message carrying the full CONFLICT output.
        await expect(mergeBranch(repo, 'mgmt-conf')).rejects.toThrow(
          /merge conflict/i
        )
        const paused = await getStatus(repo)
        expect(paused.inProgress.merge).toBe(true)
        expect(paused.conflictCount).toBe(1)
        // While paused, the workflow guard (not the dirty-tree guard)
        // answers, telling the user what to do with the merge in flight.
        await expect(mergeBranch(repo, 'main')).rejects.toThrow(
          /current merge\/rebase/
        )
      } finally {
        // Never leave the shared repo mid-merge for the tests after this one.
        await abortOperation(repo, 'merge').catch(() => undefined)
      }
      const resumed = await getStatus(repo)
      expect(resumed.inProgress.merge).toBe(false)
      expect(resumed.conflictCount).toBe(0)
      await git(['branch', '-D', 'mgmt-conf'])
      await resetClean()
    })

    it('refuses self-merge, dirty trees and detached HEAD', async () => {
      await git(['checkout', '-q', 'main'])
      await resetClean()
      await expect(mergeBranch(repo, 'main')).rejects.toThrow(
        /already the branch you are on/
      )
      write('mgmt-dirty.txt', 'dirty\n')
      await expect(mergeBranch(repo, 'side')).rejects.toThrow(
        /Commit or stash your local changes before merging\./
      )
      await resetClean()
      await git(['checkout', '-q', '--detach', 'HEAD'])
      await expect(mergeBranch(repo, 'side')).rejects.toThrow(/detached HEAD/)
      await git(['checkout', '-q', 'main'])
    })

    it('merges a remote-tracking branch', async () => {
      await git(['checkout', '-q', 'main'])
      await resetClean()
      await git(['checkout', '-q', '-b', 'mgmt-remote'])
      write('mgmt-remote.txt', 'remote\n')
      await commitAll('mgmt remote commit')
      await git(['push', '-q', 'origin', 'mgmt-remote'])
      await git(['checkout', '-q', 'main'])
      // Only the remote-tracking ref remains: the merge must resolve
      // `origin/mgmt-remote` from (name, remote) exactly like the UI sends it.
      await git(['branch', '-D', 'mgmt-remote'])
      await mergeBranch(repo, 'mgmt-remote', 'origin')
      const log = await getLog(repo, { maxCount: 10 })
      expect(log.some(c => c.summary === 'mgmt remote commit')).toBe(true)
      await git(['update-ref', '-d', 'refs/remotes/origin/mgmt-remote'])
    })
  })

})

/**
 * The clone verb, end to end against real git. The regression these guard is
 * the destination itself: the dialog sends a parent folder plus a name, and the
 * folder usually does not exist yet — so main validates the parent and the name
 * and lets `git clone` lay the folder down, running the child from the parent
 * (which does exist). A clone that only works into a hand-made empty folder is a
 * Clone button that does not work, and a clone that mkdirs the destination
 * itself fails wherever the app process may not write there (EPERM).
 */
describe('cloneRepository', () => {
  const tempDirs: string[] = []

  function temp(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
  }

  /** A one-commit source to clone from, made fresh so each case stands alone. */
  async function seedSource(): Promise<string> {
    const source = temp('aspen-clone-src-')
    await execGit(['init', '--initial-branch=main', '--quiet', source], {
      cwd: source
    })
    await execGit(['config', 'user.name', 'Test Author'], { cwd: source })
    await execGit(['config', 'user.email', 'test@example.com'], { cwd: source })
    writeFileSync(join(source, 'README.md'), '# seeded\n', 'utf8')
    await execGit(['add', '-A'], { cwd: source })
    await execGit(['commit', '--quiet', '-m', 'seed commit'], { cwd: source })
    return source
  }

  let source = ''
  beforeEach(async () => {
    source = await seedSource()
  })

  afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  })

  it('creates the destination folder and clones into it', async () => {
    const base = temp('aspen-clone-parent-')
    const destination = await cloneRepository(source, base, 'fresh-repo')

    expect(destination).toBe(join(base, 'fresh-repo'))
    expect(existsSync(join(destination, '.git'))).toBe(true)
    expect(readFileSync(join(destination, 'README.md'), 'utf8')).toContain('seeded')
    const log = await getLog(destination)
    expect(log.some(c => c.summary === 'seed commit')).toBe(true)
    expect(log).toHaveLength(1)
  })

  it('clones into a destination that already exists but is empty', async () => {
    const base = temp('aspen-clone-parent-')
    mkdirSync(join(base, 'picked'))
    const destination = await cloneRepository(source, base, 'picked')
    expect(destination).toBe(join(base, 'picked'))
    expect(existsSync(join(destination, '.git'))).toBe(true)
  })

  it('refuses a destination that already holds work and leaves it alone', async () => {
    const base = temp('aspen-clone-parent-')
    mkdirSync(join(base, 'busy'))
    writeFileSync(join(base, 'busy', 'keepme.txt'), 'mine\n', 'utf8')
    await expect(cloneRepository(source, base, 'busy')).rejects.toThrow(
      /already exists and is not empty/
    )
    expect(readFileSync(join(base, 'busy', 'keepme.txt'), 'utf8')).toBe('mine\n')
    expect(existsSync(join(base, 'busy', '.git'))).toBe(false)
  })

  it('refuses a parent folder that is not there', async () => {
    const missing = join(temp('aspen-clone-parent-'), 'nope')
    await expect(cloneRepository(source, missing, 'repo')).rejects.toThrow(
      /Parent folder does not exist/
    )
  })

  it('refuses a name that cannot be a folder', async () => {
    const base = temp('aspen-clone-parent-')
    await expect(cloneRepository(source, base, 'group/repo')).rejects.toThrow(
      /cannot be a folder here/
    )
    await expect(cloneRepository(source, base, '   ')).rejects.toThrow(
      /Enter a repository name\./
    )
  })

  it('checks the URL before it touches the disk', async () => {
    const base = temp('aspen-clone-parent-')
    await expect(cloneRepository('   ', base, 'fresh-repo')).rejects.toThrow(
      /Enter a repository URL to clone\./
    )
    expect(existsSync(join(base, 'fresh-repo'))).toBe(false)
  })

  it('leaves no folder behind when the clone fails, so a retry fits', async () => {
    const base = temp('aspen-clone-parent-')
    await expect(
      cloneRepository(join(base, 'no-such-source.git'), base, 'repo')
    ).rejects.toThrow(/clone --progress .* failed \(exit 128\)/)
    // git created the destination, so git removes it again — the retry must not
    // be blocked by a folder the failed attempt introduced.
    expect(existsSync(join(base, 'repo'))).toBe(false)
    await cloneRepository(source, base, 'repo')
    expect(existsSync(join(base, 'repo', '.git'))).toBe(true)
  })

  it('keeps a destination the user had already made when the clone fails', async () => {
    const base = temp('aspen-clone-parent-')
    mkdirSync(join(base, 'mine'))
    await expect(
      cloneRepository(join(base, 'no-such-source.git'), base, 'mine')
    ).rejects.toThrow(/clone --progress .* failed \(exit 128\)/)
    expect(existsSync(join(base, 'mine'))).toBe(true)
  })

  it('never creates the destination in-process — git does', async () => {
    // The app must not need permission to mkdir the user's folders: Electron
    // has been observed failing that with EPERM inside ~/Documents while
    // `git clone` into the same parent worked. Both verbs therefore hand the
    // missing folder to git, which creates it as its own first act.
    const base = temp('aspen-init-parent-')
    const target = join(base, 'init-makes-me')
    await execGit(['init', '--quiet', target], { cwd: base })
    expect(existsSync(join(target, '.git'))).toBe(true)
  })
})

