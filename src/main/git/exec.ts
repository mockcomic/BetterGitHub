import { spawn } from 'child_process'

/**
 * Minimal `git` child-process runner (no shell, array args), modeled on the
 * exec layer GitHub Desktop runs on top of dugite: predictable environment,
 * collected stdout/stderr, allowed exit codes and kill timeouts.
 */
export interface GitExecOptions {
  readonly cwd: string
  readonly timeoutMs?: number
  readonly input?: string
  /** Exit codes beyond 0 that count as success. */
  readonly successExitCodes?: ReadonlySet<number>
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

  const command = finalArgs.join(' ')

  return new Promise<GitExecResult>((resolve, reject) => {
    const child = spawn('git', finalArgs, {
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
    child.stderr?.on('data', (d: Buffer) => errChunks.push(d))
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
      const exitCode = code ?? -1
      const result: GitExecResult = {
        stdout: Buffer.concat(chunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        exitCode
      }
      const allowed = options.successExitCodes ?? new Set<number>([0])
      if (killed !== undefined) {
        reject(new Error(`git ${command} ${killed}`))
      } else if (exitCode !== 0 && !allowed.has(exitCode)) {
        reject(new GitExecError(command, result))
      } else {
        resolve(result)
      }
    })
  })
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
