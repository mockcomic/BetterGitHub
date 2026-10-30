import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { execGit } from '../src/main/git/exec'
import { getStatus } from '../src/main/git/status'
import { getLog } from '../src/main/git/log'
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
  undoLastCommit
} from '../src/main/git/commit'
import {
  applyStash,
  dropStash,
  listStashes,
  popStash,
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