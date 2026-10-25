import { spawn } from 'child_process'
import {
  GitWriteBlockedError,
  isGitWriteBlocked,
  tryRunGitViaBroker
} from './sandbox'

/**
 * Minimal `git` child-process runner (no shell, array args), modeled on the
 * exec layer GitHub Desktop runs on top of dugite: predictable environment,
 * collected stdout/stderr, allowed exit codes and kill timeouts.
 *
 * On Windows, a GitDesk launched from an agent/command sandbox runs its git
 * children at Low process integrity, where writes into the repository's
 * `.git` directory are blocked by the OS while reads still work. When that
 * specific failure surfaces (`Unable to create '…\.git\index.lock':
 * Permission denied`), the command is re-run once through the elevated
 * file-queue broker (see ./sandbox.ts) so staging/committing keeps working
 * in the UI; if no broker can help, the raw fatal is replaced with a
 * `GitWriteBlockedError` that explains the fix.
 */
export interface GitExecOptions {
  readonly cwd: string
  readonly timeoutMs?: number
  readonly input?: string
  /** Exit codes beyond 0 that count as success. */
  readonly successExitCodes?: ReadonlySet<number>
  /** Extra variables merged on top of the default git environment. */
  readonly env?: Readonly<Record<string, string>>
  readonly maxOutputBytes?: number
  /** Skip the default `-c core.quotepath=false` (used for plumbing we parse raw). */
  readonly noDefaults?: boolean
}

export interface GitExecResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export class GitExecError extends Error {
  public constructor(
    public readonly command: string,
    public readonly result: GitExecResult
  ) {
    super(
      `git ${command} failed (${describe(result)}): ${firstLine(
        result.stderr || result.stdout
      )}`
    )
    this.name = 'GitExecError'
  }
}

function describe(r: GitExecResult): string {
  return `exit ${r.exitCode}`
}

function firstLine(s: string): string {
  const line = s.split(/\r?\n/).find(l => l.trim().length > 0)
  return line?.trim() ?? 'unknown error'
}

const DEFAULT_MAX_OUTPUT = 64 * 1024 * 1024

/**
 * The single place that decides whether a git result counts as success.
 * Shared by the direct spawn and the brokered rerun so allowed exit codes
 * and error shapes stay identical on both paths.
 */
export function settleGitResult(
  command: string,
  result: GitExecResult,
  options: GitExecOptions
): GitExecResult {
  const allowed = options.successExitCodes ?? new Set<number>([0])
  if (result.exitCode !== 0 && !allowed.has(result.exitCode)) {
    throw new GitExecError(command, result)
  }
  return result
}

async function runGitDirect(
  command: string,
  finalArgs: ReadonlyArray<string>,
  options: GitExecOptions,
  env: NodeJS.ProcessEnv
): Promise<GitExecResult> {
  return new Promise<GitExecResult>((resolve, reject) => {
    const child = spawn('git', [...finalArgs], {
      cwd: options.cwd,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    let outBytes = 0
    const maxOut = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT
    let killed: string | undefined

    const timer =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            killed = `timed out after ${options.timeoutMs}ms`
            child.kill()
          }, options.timeoutMs)
        : undefined

    child.stdout?.on('data', (d: Buffer) => {
      outBytes += d.length
      if (outBytes > maxOut) {
        killed = `output exceeded ${maxOut} bytes`
        child.kill()
      } else {
        chunks.push(d)
      }
    })
    // stderr shares the output budget: without this a command flooding stderr
    // (progress noise, a repo that makes git warn per line) accumulates
    // unbounded memory while the stdout cap and the timeout both stay silent.
    child.stderr?.on('data', (d: Buffer) => {
      outBytes += d.length
      if (outBytes > maxOut) {
        killed = `output exceeded ${maxOut} bytes`
        child.kill()
      } else {
        errChunks.push(d)
      }
    })
    child.stderr?.on('error', () => undefined)

    if (options.input !== undefined && child.stdin) {
      child.stdin.end(options.input)
    } else {
      child.stdin?.end()
    }

    child.on('error', err => {
      if (timer !== undefined) clearTimeout(timer)
      reject(new Error(`Failed to start git (${command}): ${err.message}`))
    })

    child.on('close', code => {
      if (timer !== undefined) clearTimeout(timer)
      if (killed !== undefined) {
        reject(new Error(`git ${command} ${killed}`))
        return
      }
      resolve({
        stdout: Buffer.concat(chunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        exitCode: code ?? -1
      })
    })
  })
}

export async function execGit(
  args: ReadonlyArray<string>,
  options: GitExecOptions
): Promise<GitExecResult> {
  const finalArgs = options.noDefaults
    ? [...args]
    : ['-c', 'core.quotepath=false', ...args]

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    // Never pick up a caller-provided editor for interactive operations.
    GIT_EDITOR: ':'
  }
  // Remove rather than blank: on Windows a *set-but-empty* GIT_EXTERNAL_DIFF
  // still activates the external-diff machinery, and git then tries to spawn
  // a program named "" ("error: cannot spawn : No such file or directory").
  delete env.GIT_ASKPASS
  delete env.GIT_EXTERNAL_DIFF
  delete env.GIT_PAGER
  delete env.EDITOR
  if (options.env !== undefined) Object.assign(env, options.env)

  const command = finalArgs.join(' ')

  const result = await runGitDirect(command, finalArgs, options, env)

  try {
    return settleGitResult(command, result, options)
  } catch (err) {
    if (err instanceof GitExecError && isGitWriteBlocked(err.result)) {
      // A sandbox blocked the .git write. The command could not have applied
      // anything (git died opening its lock file), so rerunning it at normal
      // integrity through the broker is safe.
      const viaBroker = await tryRunGitViaBroker(command, finalArgs, options)
      if (viaBroker !== null) return settleGitResult(command, viaBroker, options)
      throw new GitWriteBlockedError(command, err.result)
    }
    throw err
  }
}

export function friendlyGitError(err: unknown): string {
  if (err instanceof GitExecError) {
    return err.message
  }
  if (err instanceof Error) {
    return err.message
  }
  return String(err)
}
