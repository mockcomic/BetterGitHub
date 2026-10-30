import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  appendGitignoreRules,
  buildIgnoreRules,
  escapeGitignoreSegment,
  extensionOf,
  gitignoreRuleFor,
  ruleMatchesPath,
  trackedInScopeOf
} from '../src/main/git/ignore'

describe('buildIgnoreRules', () => {
  const file = 'logs/app/nightly/run.log'

  it('builds the exact-path rule for mode file', () => {
    expect(buildIgnoreRules(file, false, { mode: 'file' })).toEqual([file])
  })

  it('appends the slash for directory targets', () => {
    expect(buildIgnoreRules('logs/app', true, { mode: 'file' })).toEqual([
      'logs/app/'
    ])
  })

  it('builds an unanchored basename rule for mode name', () => {
    expect(buildIgnoreRules(file, false, { mode: 'name' })).toEqual(['run.log'])
  })

  it('builds an unanchored extension rule for mode extension', () => {
    expect(buildIgnoreRules(file, false, { mode: 'extension' })).toEqual(['*.log'])
  })

  it('returns no rules when the path has no extension', () => {
    expect(buildIgnoreRules('README', false, { mode: 'extension' })).toEqual([])
    expect(buildIgnoreRules('.env', false, { mode: 'extension' })).toEqual([])
    expect(buildIgnoreRules('archive.', false, { mode: 'extension' })).toEqual([])
  })

  it('builds the containing-folder rule for mode folder', () => {
    expect(buildIgnoreRules(file, false, { mode: 'folder' })).toEqual([
      'logs/app/nightly/'
    ])
  })

  it('builds the direct-children rule for mode folderDirect', () => {
    expect(buildIgnoreRules(file, false, { mode: 'folderDirect' })).toEqual([
      'logs/app/nightly/*'
    ])
  })

  it('builds the root-folder rule for mode rootFolder', () => {
    expect(buildIgnoreRules(file, false, { mode: 'rootFolder' })).toEqual(['logs/'])
    // A top-level folder stays a top-level folder.
    expect(buildIgnoreRules('logs/app.log', false, { mode: 'rootFolder' })).toEqual([
      'logs/'
    ])
  })

  it('returns no folder rules for files at the repository root', () => {
    expect(buildIgnoreRules('README.md', false, { mode: 'folder' })).toEqual([])
    expect(buildIgnoreRules('README.md', false, { mode: 'folderDirect' })).toEqual([])
  })

  it('builds cumulative depth-limited extension rules', () => {
    const dir = 'logs/app'
    expect(
      buildIgnoreRules(`${dir}/run.log`, false, { mode: 'extensionInFolder', depth: 1 })
    ).toEqual([`${dir}/*.log`])
    expect(
      buildIgnoreRules(`${dir}/run.log`, false, { mode: 'extensionInFolder', depth: 2 })
    ).toEqual([`${dir}/*.log`, `${dir}/*/*.log`])
    expect(
      buildIgnoreRules(`${dir}/run.log`, false, { mode: 'extensionInFolder', depth: 3 })
    ).toEqual([`${dir}/*.log`, `${dir}/*/*.log`, `${dir}/*/*/*.log`])
  })

  it('builds the doublestar rule for any depth', () => {
    expect(
      buildIgnoreRules('logs/app/run.log', false, {
        mode: 'extensionInFolder',
        depth: 'any'
      })
    ).toEqual(['logs/app/**/*.log'])
  })

  it('leaves allUntracked to the caller', () => {
    expect(buildIgnoreRules(file, false, { mode: 'allUntracked' })).toEqual([])
  })

  it('escapes gitignore special characters in path segments', () => {
    expect(buildIgnoreRules('we[ird]/name?.log', false, { mode: 'folder' })).toEqual([
      'we\\[ird\\]/'
    ])
    expect(
      buildIgnoreRules('we[ird]/name?.log', false, { mode: 'rootFolder' })
    ).toEqual(['we\\[ird\\]/'])
    expect(escapeGitignoreSegment('!important')).toEqual('\\!important')
    expect(escapeGitignoreSegment('#hash')).toEqual('\\#hash')
    expect(escapeGitignoreSegment('trailing  ')).toEqual('trailing\\ ')
  })

  it('reports extensions and none for dot-files', () => {
    expect(extensionOf('a/b/run.log')).toBe('log')
    expect(extensionOf('.env')).toBeNull()
    expect(extensionOf('archive.tar.gz')).toBe('gz')
  })

  it('keeps the legacy single-rule helper working', () => {
    expect(gitignoreRuleFor('logs/app.log', false)).toEqual('logs/app.log')
    expect(gitignoreRuleFor('logs/app', true)).toEqual('logs/app/')
    expect(gitignoreRuleFor('/leading/slash.txt', false)).toEqual('leading/slash.txt')
  })
})

describe('ruleMatchesPath', () => {
  it('matches exact file rules', () => {
    expect(ruleMatchesPath('logs/app.log', 'logs/app.log')).toBe(true)
    expect(ruleMatchesPath('logs/app.log', 'other/app.log')).toBe(false)
  })

  it('matches unanchored basename rules at any depth', () => {
    expect(ruleMatchesPath('*.log', 'a/b/c.log')).toBe(true)
    expect(ruleMatchesPath('run.log', 'deep/nested/run.log')).toBe(true)
    expect(ruleMatchesPath('run.log', 'deep/nested/run.txt')).toBe(false)
  })

  it('covers directory subtrees', () => {
    expect(ruleMatchesPath('logs/', 'logs/x.txt')).toBe(true)
    expect(ruleMatchesPath('logs/', 'logs/deep/x.txt')).toBe(true)
    expect(ruleMatchesPath('logs/', 'other/x.txt')).toBe(false)
  })

  it('matches single-level wildcards, incl. matched directories', () => {
    expect(ruleMatchesPath('logs/*', 'logs/x.txt')).toBe(true)
    // `logs/*` matches the directory `logs/deep`, and git never descends
    // into an ignored directory, so its contents are covered too.
    expect(ruleMatchesPath('logs/*', 'logs/deep/x.txt')).toBe(true)
    expect(ruleMatchesPath('logs/*.log', 'logs/x.log')).toBe(true)
    expect(ruleMatchesPath('logs/*.log', 'logs/deep/x.log')).toBe(false)
  })

  it('matches the doublestar form across any depth', () => {
    expect(ruleMatchesPath('logs/**/*.log', 'logs/x.log')).toBe(true)
    expect(ruleMatchesPath('logs/**/*.log', 'logs/a/b/x.log')).toBe(true)
    expect(ruleMatchesPath('logs/**/*.log', 'other/x.log')).toBe(false)
  })

  it('treats escaped literals as literals', () => {
    expect(ruleMatchesPath('we\\[ird\\]/', 'we[ird]/x.txt')).toBe(true)
    expect(ruleMatchesPath('we\\[ird\\]/', 'weXirdY/x.txt')).toBe(false)
  })
})

describe('trackedInScopeOf', () => {
  it('counts tracked files a rule cannot hide', () => {
    const tracked = ['logs/old.log', 'logs/deep/old.log', 'keep/other.log']
    expect(trackedInScopeOf(['logs/'], tracked)).toBe(2)
    expect(trackedInScopeOf(['logs/*'], tracked)).toBe(2)
    expect(trackedInScopeOf(['*.log'], tracked)).toBe(3)
    expect(trackedInScopeOf(['logs/**/*.log'], tracked)).toBe(2)
    expect(trackedInScopeOf(['logs/*.log'], tracked)).toBe(1)
    expect(trackedInScopeOf(['logs/old.log'], tracked)).toBe(1)
    expect(trackedInScopeOf(['other/'], tracked)).toBe(0)
  })
})

describe('appendGitignoreRules', () => {
  let repo = ''

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'aspen-ignore-'))
  })

  const file = (): string => join(repo, '.gitignore')

  it('creates a missing .gitignore with the rules', async () => {
    const appended = await appendGitignoreRules(repo, ['logs/', 'secrets.json'])
    expect(appended).toEqual(['logs/', 'secrets.json'])
    expect(readFileSync(file(), 'utf8')).toBe('logs/\nsecrets.json\n')
  })

  it('skips rules already present verbatim', async () => {
    const appended = await appendGitignoreRules(repo, ['logs/', 'new/*.log'])
    expect(appended).toEqual(['new/*.log'])
    expect(readFileSync(file(), 'utf8')).toBe('logs/\nsecrets.json\nnew/*.log\n')
  })

  it('separates from content without a trailing newline', async () => {
    writeFileSync(file(), 'node_modules/', 'utf8')
    const appended = await appendGitignoreRules(repo, ['.idea/'])
    expect(appended).toEqual(['.idea/'])
    expect(readFileSync(file(), 'utf8')).toBe('node_modules/\n.idea/\n')
  })

  it('is a no-op for an empty or all-blank rule list', async () => {
    writeFileSync(file(), 'a\n', 'utf8')
    expect(await appendGitignoreRules(repo, [])).toEqual([])
    expect(await appendGitignoreRules(repo, ['', ' '])).toEqual([])
    expect(readFileSync(file(), 'utf8')).toBe('a\n')
  })

  it('matches trimmed existing entries (CRLF included)', async () => {
    writeFileSync(file(), 'crlf-entry\r\n', 'utf8')
    expect(await appendGitignoreRules(repo, ['crlf-entry'])).toEqual([])
  })
})
