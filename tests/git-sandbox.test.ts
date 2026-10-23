import { describe, expect, it } from 'vitest'
import { spawn, spawnSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  configureGitBroker,
  GitWriteBlockedError,
  isGitWriteBlocked,
  tryRunGitViaBroker
} from '../src/main/git/sandbox'
import type { GitBrokerResponse } from '../src/main/git/sandbox'
import type { GitExecResult } from '../src/main/git/exec'

const BROKER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'git-broker.mjs'
)

function failResult(stderr: string): GitExecResult {
  return { stdout: '', stderr, exitCode: 128 }
}

describe('isGitWriteBlocked', () => {
  it('matches the real sandbox failure (forward slashes, index.lock)', () => {
    expect(
      isGitWriteBlocked(
        failResult(
          "fatal: Unable to create 'C:/Users/KH-PC/Documents/GitHub/dropsecret/.git/index.lock': Permission denied"
        )
      )
    ).toBe(true)
  })

  it('matches backslash paths and other .git lock files', () => {
    expect(
      isGitWriteBlocked(
        failResult(
          "unable to write to '.git\\config.lock': could not lock: Permission denied"
        )
      )
    ).toBe(true)
  })

  it('does not match unrelated git failures', () => {
    expect(
      isGitWriteBlocked(
        failResult("fatal: not a git repository (or any of the parent directories): .git")
      )
    ).toBe(false)
    expect(
      isGitWriteBlocked(failResult("fatal: bad revision 'HEAD'"))
    ).toBe(false)
    // Permission denied, but not on a .git path → some other filesystem
    // problem the broker cannot fix either.
    expect(
      isGitWriteBlocked(
        failResult("error: unable to create big.txt: Permission denied")
      )
    ).toBe(false)
  })
})

describe('GitWriteBlockedError', () => {
  it('explains the sandbox and names both fixes', () => {
    const err = new GitWriteBlockedError(
      'add -A .',
      failResult("fatal: Unable to create 'x/.git/index.lock': Permission denied")
    )
    expect(err.message).toContain('.git')
    expect(err.message).toContain('sandbox')
    expect(err.message).toContain('git-broker.mjs --install-task')
    expect(err.message).toContain('Unable to create')
  })
})

function makeQueue(): string {
  return mkdtempSync(join(tmpdir(), 'gitdesk-broker-'))
}

function runBroker(queueDir: string, extra: ReadonlyArray<string> = []): string {
  const r = spawnSync(process.execPath, [BROKER, '--queue', queueDir, ...extra], {
    encoding: 'utf8'
  })
  if (r.error) throw r.error
  return `${r.stdout ?? ''}${r.stderr ?? ''}`
}

function writeRequest(queueDir: string, stem: string, body: unknown): string {
  const dir = join(queueDir, 'requests')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${stem}.json`),
    typeof body === 'string' ? body : JSON.stringify(body),
    'utf8'
  )
  return join(queueDir, 'responses', `${stem}.json`)
}

function readResponse(file: string): GitBrokerResponse {
  return JSON.parse(readFileSync(file, 'utf8')) as GitBrokerResponse
}

describe('git-broker.mjs --once', () => {
  it('executes a queued git command and publishes the response', () => {
    const q = makeQueue()
    try {
      const resFile = writeRequest(q, 'ok', {
        id: 'ok',
        kind: 'git',
        args: ['--version'],
        cwd: process.cwd()
      })
      runBroker(q, ['--once'])
      expect(existsSync(resFile)).toBe(true)
      const res = readResponse(resFile)
      expect(res.ok).toBe(true)
      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('git version')
      // Queue layout is drained: claimed, answered, archived.
      expect(readdirSync(join(q, 'requests'))).toEqual([])
      expect(readdirSync(join(q, 'processing'))).toEqual([])
      expect(readdirSync(join(q, 'done'))).toEqual(['ok.json'])
    } finally {
      rmSync(q, { recursive: true, force: true })
    }
  }, 30_000)

  it('reports nonzero git exits faithfully (success is the app\'s call)', () => {
    const q = makeQueue()
    const emptyRepo = mkdtempSync(join(tmpdir(), 'gitdesk-notrepo-'))
    try {
      const resFile = writeRequest(q, 'nope', {
        id: 'nope',
        kind: 'git',
        args: ['rev-parse', 'HEAD'],
        cwd: emptyRepo
      })
      runBroker(q, ['--once'])
      const res = readResponse(resFile)
      expect(res.ok).toBe(true)
      expect(res.exitCode).not.toBe(0)
      expect(res.stderr).toContain('not a git repository')
    } finally {
      rmSync(q, { recursive: true, force: true })
      rmSync(emptyRepo, { recursive: true, force: true })
    }
  }, 30_000)

  it('answers an invalid request with ok:false instead of crashing', () => {
    const q = makeQueue()
    try {
      const resFile = writeRequest(q, 'bad', '{not json')
      runBroker(q, ['--once'])
      const res = readResponse(resFile)
      expect(res.ok).toBe(false)
      expect(res.error ?? '').toContain('Invalid request')
    } finally {
      rmSync(q, { recursive: true, force: true })
    }
  }, 30_000)

  it('rejects a request without args/cwd', () => {
    const q = makeQueue()
    try {
      const resFile = writeRequest(q, 'shape', { id: 'shape', cwd: 5 })
      runBroker(q, ['--once'])
      const res = readResponse(resFile)
      expect(res.ok).toBe(false)
      expect(res.error ?? '').toContain('args')
    } finally {
      rmSync(q, { recursive: true, force: true })
    }
  }, 30_000)

  it('reclaims orphans left in processing/ by a crashed broker', () => {
    const q = makeQueue()
    try {
      writeRequest(q, 'orphan', { id: 'orphan', kind: 'git', args: ['--version'], cwd: process.cwd() })
      // Simulate a crash after claiming.
      const processing = join(q, 'processing')
      mkdirSync(processing, { recursive: true })
      writeFileSync(
        join(processing, 'orphan.json'),
        readFileSync(join(q, 'requests', 'orphan.json'), 'utf8'),
        'utf8'
      )
      rmSync(join(q, 'requests', 'orphan.json'))
      runBroker(q, ['--once'])
      expect(readResponse(join(q, 'responses', 'orphan.json')).ok).toBe(true)
    } finally {
      rmSync(q, { recursive: true, force: true })
    }
  }, 30_000)

  it('times out a hung command and flags it', () => {
    const q = makeQueue()
    try {
      const resFile = writeRequest(q, 'slow', {
        id: 'slow',
        kind: 'git',
        args: ['--version'],
        cwd: process.cwd(),
        timeoutMs: 1
      })
      runBroker(q, ['--once'])
      const res = readResponse(resFile)
      expect(res.ok).toBe(true)
      expect(res.timedOut).toBe(true)
    } finally {
      rmSync(q, { recursive: true, force: true })
    }
  }, 30_000)

  it('truncates oversized stdout and flags it', () => {
    const q = makeQueue()
    try {
      const resFile = writeRequest(q, 'big', {
        id: 'big',
        kind: 'git',
        args: ['--version'],
        cwd: process.cwd(),
        maxOutputBytes: 4
      })
      runBroker(q, ['--once'])
      const res = readResponse(resFile)
      expect(res.ok).toBe(true)
      expect(res.truncatedStdout).toBe(true)
    } finally {
      rmSync(q, { recursive: true, force: true })
    }
  }, 30_000)

  it('--status reports an untouched queue as absent', () => {
    const q = makeQueue()
    try {
      const out = runBroker(q, ['--status'])
      expect(out).toContain('absent')
      expect(out).toContain(q)
    } finally {
      rmSync(q, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('tryRunGitViaBroker', () => {
  it('returns null when the broker is disabled', async () => {
    configureGitBroker({ queueDir: null, enabled: false })
    expect(
      await tryRunGitViaBroker('git --version', ['--version'], { cwd: process.cwd() })
    ).toBeNull()
  })

  it('gives up and cleans its request when no broker is alive', async () => {
    const q = makeQueue()
    try {
      configureGitBroker({ queueDir: q, enabled: true, livenessMs: 300 })
      const started = Date.now()
      const res = await tryRunGitViaBroker('git --version', ['--version'], {
        cwd: process.cwd()
      })
      expect(res).toBeNull()
      // The request was written and removed — not left for a phantom broker.
      const leftovers = existsSync(join(q, 'requests'))
        ? readdirSync(join(q, 'requests'))
        : []
      expect(leftovers).toEqual([])
      expect(Date.now() - started).toBeLessThan(10_000)
    } finally {
      configureGitBroker({ queueDir: null, enabled: true, livenessMs: 8000 })
      rmSync(q, { recursive: true, force: true })
    }
  }, 30_000)

  it('runs a command end-to-end through a live broker', async () => {
    const q = makeQueue()
    const child = spawn(
      process.execPath,
      [BROKER, '--queue', q, '--poll', '40'],
      { stdio: 'ignore' }
    )
    try {
      // Wait for the broker heartbeat (lock file) to appear.
      const lock = join(q, 'broker.lock')
      const deadline = Date.now() + 10_000
      while (!existsSync(lock) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 100))
      }
      expect(existsSync(lock)).toBe(true)

      configureGitBroker({ queueDir: q, enabled: true, livenessMs: 1500 })
      const res = await tryRunGitViaBroker('git --version', ['--version'], {
        cwd: process.cwd()
      })
      expect(res).not.toBeNull()
      expect(res?.exitCode).toBe(0)
      expect(res?.stdout).toContain('git version')
    } finally {
      child.kill()
      configureGitBroker({ queueDir: null, enabled: true, livenessMs: 8000 })
      rmSync(q, { recursive: true, force: true })
    }
  }, 30_000)
})
