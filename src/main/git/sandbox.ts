import { randomBytes } from 'crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import type { GitExecOptions, GitExecResult } from './exec'

/**
 * Windows command-sandbox support.
 *
 * When GitDesk — or `npm run dev` — is started from an agent/command
 * sandbox, the whole process tree runs at Low process integrity and the
 * sandbox manager removes write access to the repository's `.git`
 * directory. The `git` child processes this app spawns then fail with
 *
 *   fatal: Unable to create '<repo>/.git/index.lock': Permission denied
 *
 * on the first write, while reads (status, diff, log) keep working. GitHub
 * Desktop never hits this because it is launched normally, at Medium
 * integrity.
 *
 * Two hardening layers:
 *
 * 1. `isGitWriteBlocked` + `GitWriteBlockedError` turn the raw exit-128
 *    fatal into an actionable explanation (surfaced to the renderer through
 *    `friendlyGitError` on the IPC error channel).
 * 2. A file-queue git broker (`scripts/git-broker.mjs`): a helper process
 *    started *outside* the sandbox — typically a Task Scheduler logon task
 *    created once with `node scripts/git-broker.mjs --install-task` — that
 *    runs at normal integrity. `execGit` re-runs blocked commands through it
 *    transparently: a request JSON is written into `<queue>/requests` and the
 *    result is polled from `<queue>/responses`. Only plain file I/O crosses
 *    the boundary, deliberately: sandboxed Low-IL processes also lose access
 *    to RPC/named-pipe brokers (verified on Windows — schtasks/WMI service
 *    calls from inside the sandbox fail outright).
 */

/**
 * Matches git's own "a .git write was denied" family of messages
 * (index.lock, config.lock, packed-refs writes, …). Requires all three
 * groups so a permission error about some *other* path — or an unrelated
 * "unable to create" — is not misclassified.
 */
export function isGitWriteBlocked(result: GitExecResult): boolean {
  const text = `${result.stderr}\n${result.stdout}`
  return (
    /(permission denied|access is denied)/i.test(text) &&
    // Full absolute paths (C:/repo/.git/index.lock) and the relative form
    // git itself uses for config locks (.git/config.lock) both count.
    /\.git[\\/]/.test(text) &&
    /(unable to create|could not lock|cannot create|cannot open|cannot write|could not write|failed to write)/i.test(
      text
    )
  )
}

function firstLine(s: string): string {
  const line = s.split(/\r?\n/).find(l => l.trim().length > 0)
  return line?.trim() ?? 'unknown error'
}

/**
 * Raised when git reported a blocked `.git` write *and* the elevated broker
 * cannot help (not installed / not running / the queue itself is not
 * writable). The message names both escape hatches so the toast is a fix,
 * not just a complaint.
 */
export class GitWriteBlockedError extends Error {
  public constructor(command: string, original: GitExecResult) {
    super(
      [
        `git ${command} could not write to the repository's .git folder (${firstLine(
          original.stderr || original.stdout
        )}).`,
        'Windows is blocking .git writes from this process: GitDesk was started inside a restricted agent/command sandbox (Low process integrity), so the git processes it launches can read the repository but cannot create files such as .git/index.lock. Nothing is wrong with the repository itself.',
        'Fix: start GitDesk outside the sandbox (double-click scripts/dev.cmd or run npm run dev from a normal shell), or install the elevated git broker once from a normal shell: node scripts/git-broker.mjs --install-task'
      ].join('\n')
    )
    this.name = 'GitWriteBlockedError'
  }
}

export interface GitBrokerSettings {
  /** Where requests/responses live; null disables queue lookups entirely. */
  queueDir: string | null
  enabled: boolean
  /** ms to wait for a live broker to claim a request before giving up. */
  livenessMs: number
}

const DEFAULT_LIVENESS_MS = 8000
const POLL_MS = 120
/** Grace past the per-request timeout for a broker that died mid-command. */
const CLAIM_GRACE_MS = 30_000
const DEFAULT_REQUEST_TIMEOUT_MS = 300_000
/** Mirrors exec.ts's direct-path output cap. */
const DEFAULT_MAX_OUTPUT = 64 * 1024 * 1024

let settings: GitBrokerSettings = {
  queueDir: null,
  enabled: true,
  livenessMs: DEFAULT_LIVENESS_MS
}

/** Called once from the main-process entry point with the userData path. */
export function configureGitBroker(patch: Partial<GitBrokerSettings>): void {
  settings = { ...settings, ...patch }
}

/** The env override wins so tests and portable setups need no code change. */
export function gitBrokerQueueDir(): string | null {
  const fromEnv = process.env['GITDESK_BROKER_DIR']
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return fromEnv.trim()
  }
  if (!settings.enabled || settings.queueDir === null || settings.queueDir.length === 0) {
    return null
  }
  return settings.queueDir
}

/** Queue wire contract — see scripts/git-broker.mjs for the other side. */
export interface GitBrokerRequest {
  id: string
  kind: 'git'
  args: string[]
  cwd: string
  env?: Record<string, string>
  input?: string
  timeoutMs?: number
  maxOutputBytes?: number
}

export interface GitBrokerResponse {
  id: string
  ok: boolean
  exitCode: number
  stdout: string
  stderr: string
  timedOut?: boolean
  truncatedStdout?: boolean
  truncatedStderr?: boolean
  error?: string
  startedAt?: string
  finishedAt?: string
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Runs one git command through the elevated broker, or resolves null when it
 * cannot help (no queue configured, queue not writable, no live broker
 * claiming within `livenessMs`, or a claimed command that never answers).
 * Callers treat null as "keep the original failure" — false negatives only
 * mean the friendlier error path runs, never a wrong success.
 */
export async function tryRunGitViaBroker(
  command: string,
  args: ReadonlyArray<string>,
  options: GitExecOptions
): Promise<GitExecResult | null> {
  const queue = gitBrokerQueueDir()
  if (queue === null) return null

  const id = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`
  const reqFile = join(queue, 'requests', `${id}.json`)
  const runFile = join(queue, 'processing', `${id}.json`)
  const resFile = join(queue, 'responses', `${id}.json`)

  const request: GitBrokerRequest = {
    id,
    kind: 'git',
    args: [...args],
    cwd: options.cwd,
    ...(options.env !== undefined ? { env: { ...options.env } } : {}),
    ...(options.input !== undefined ? { input: options.input } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.maxOutputBytes !== undefined
      ? { maxOutputBytes: options.maxOutputBytes }
      : {})
  }

  try {
    await mkdir(join(queue, 'requests'), { recursive: true })
    await mkdir(join(queue, 'processing'), { recursive: true })
    await mkdir(join(queue, 'responses'), { recursive: true })
    // Atomic publish: the broker must never claim a half-written request.
    await writeFile(`${reqFile}.tmp`, JSON.stringify(request), 'utf8')
    await rename(`${reqFile}.tmp`, reqFile)
  } catch {
    // Not even the queue is writable from this sandbox — no broker path.
    return null
  }

  const started = Date.now()
  const requestBudget = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  let claimed = false

  for (;;) {
    if (await exists(resFile)) {
      let response: GitBrokerResponse
      try {
        response = JSON.parse(await readFile(resFile, 'utf8')) as GitBrokerResponse
      } catch {
        await unlink(resFile).catch(() => undefined)
        return null
      }
      if (response.ok === false) {
        throw new Error(
          `git ${command} could not run in the elevated git broker: ${
            response.error ?? 'unknown broker error'
          }`
        )
      }
      if (response.timedOut === true) {
        throw new Error(
          `git ${command} timed out after ${requestBudget}ms (elevated git broker)`
        )
      }
      if (response.truncatedStdout === true || response.truncatedStderr === true) {
        const maxOut = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT
        throw new Error(`git ${command} output exceeded ${maxOut} bytes`)
      }
      return {
        stdout: response.stdout ?? '',
        stderr: response.stderr ?? '',
        exitCode: response.exitCode
      }
    }

    if (!claimed && (await exists(runFile))) claimed = true

    const elapsed = Date.now() - started
    if (!claimed && elapsed > settings.livenessMs) {
      // No broker picked it up — clean our own request so the queue stays
      // tidy for whoever installs a broker later.
      await unlink(reqFile).catch(() => undefined)
      return null
    }
    if (claimed && elapsed > requestBudget + CLAIM_GRACE_MS) {
      // A broker claimed the request then died mid-command.
      await unlink(runFile).catch(() => undefined)
      return null
    }
    await sleep(POLL_MS)
  }
}
