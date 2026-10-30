#!/usr/bin/env node
/**
 * Aspen elevated git broker (Windows sandbox hardening).
 *
 * When Aspen is launched from an agent/command sandbox, its whole process
 * tree runs at Low process integrity: reads of a repository work, but any
 * git command that writes into `.git` (add / commit / stash / checkout …)
 * dies on `Unable to create '…\.git\index.lock': Permission denied`.
 * RPC- and named-pipe-based launchers (Task Scheduler API, WMI) are also
 * unreachable from inside such a sandbox, so the app cannot spawn its own
 * elevated helper. A plain file queue can cross that boundary — and that is
 * exactly this broker.
 *
 * How it works (per watched queue root):
 *   <queue>/requests/<id>.json    app → broker   (atomic rename publish)
 *   <queue>/processing/<id>.json  broker claim   (atomic rename claim)
 *   <queue>/responses/<id>.json   broker → app   (atomic rename publish)
 *   <queue>/done/<id>.json        archived request for debugging (swept)
 *   <queue>/broker.lock           {pid, startedAt, node, queue}, touched as
 *                                 a heartbeat every poll (what --status reads)
 *   <queue>/broker.log            best-effort append log (rotated at 1 MB)
 *
 * Queue roots watched (deduplicated):
 *   - every --queue <dir> passed on the command line (or ASPEN_BROKER_DIR,
 *     or the platform default %APPDATA%/Aspen/git-broker);
 *   - when running from an Aspen checkout, <repo>/.userdata-dev/git-broker —
 *     the directory a Low-integrity dev instance can actually write to;
 *   - the ASPEN_PROFILE (or legacy GITDESK_PROFILE) override dir, if set, same reasoning.
 * So `npm run git-broker:install` from a normal shell needs no arguments and
 * still serves the sandboxed dev server out of the box.
 *
 * The broker runs git with the same environment hygiene as the in-app direct
 * path (src/main/git/exec.ts): GIT_TERMINAL_PROMPT=0, GIT_EDITOR=:, and
 * GIT_ASKPASS / GIT_EXTERNAL_DIFF / GIT_PAGER / EDITOR removed. The app
 * already passes the fully-built argv (including `-c core.quotepath=false`),
 * so both paths execute identical commands.
 *
 * Wire types live in src/main/git/sandbox.ts (GitBrokerRequest /
 * GitBrokerResponse). A response always echoes the request id (falling back
 * to the file stem for unparseable requests), reports exit code, captured
 * stdout/stderr, and truncation/timeout flags — the *app* decides success
 * semantics (allowed exit codes etc.), never the broker.
 *
 * Usage
 *   node scripts/git-broker.mjs                       run resident (foreground)
 *   node scripts/git-broker.mjs --install-task        register + start a Windows
 *                                                     Task Scheduler logon task
 *                                                     (run this from a *normal* shell)
 *   node scripts/git-broker.mjs --uninstall-task      remove the logon task
 *   node scripts/git-broker.mjs --status              report broker state per queue
 *   node scripts/git-broker.mjs --once                drain pending requests and exit
 *   Options: --queue <dir> (repeatable)  --git <path>  --poll <ms>  --idle-exit <ms>
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TASK_NAME = 'AspenGitBroker'
const LOCK_STALE_MS = 15_000
const RESPONSE_MAX_AGE_MS = 6 * 60 * 60_000
const DONE_MAX_AGE_MS = 7 * 24 * 60 * 60_000
const TMP_MAX_AGE_MS = 60 * 60_000
const LOG_MAX_BYTES = 1024 * 1024
const DEFAULT_REQUEST_TIMEOUT_MS = 300_000
const DEFAULT_MAX_OUTPUT = 64 * 1024 * 1024

function parseArgs(argv) {
  const flags = { queues: [] }
  const valueKeys = new Set(['queue', 'git', 'poll', 'idle-exit'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    if (valueKeys.has(key) && i + 1 < argv.length) {
      const value = argv[++i]
      if (key === 'queue') flags.queues.push(value)
      else flags[key] = value
    } else flags[key] = true
  }
  return flags
}

function defaultQueueDir() {
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    return join(appdata, 'Aspen', 'git-broker')
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(xdg, 'Aspen', 'git-broker')
}

/** The queue roots a pre-rename GitDesk install used, so one broker still
 *  serves an upgraded machine's leftovers (see src/main/migrate.ts). */
function legacyQueueDirs() {
  const dirs = []
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    dirs.push(join(appdata, 'GitDesk', 'git-broker'))
  } else {
    const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
    dirs.push(join(xdg, 'GitDesk', 'git-broker'))
  }
  return dirs
}

const flags = parseArgs(process.argv.slice(2))
const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = resolve(dirname(scriptPath), '..')

/**
 * Which queue roots this broker instance serves. Explicit --queue (possibly
 * several) replaces the platform default; the dev-profile queues reachable
 * from a Low-integrity dev launch are always added when they belong to this
 * checkout, so a broker installed without arguments still serves a sandboxed
 * `npm run dev` instance.
 */
function collectQueues() {
  const roots = new Set()
  const add = p => roots.add(resolve(p))
  if (flags.queues.length > 0) flags.queues.forEach(q => add(q))
  else {
    const envDir = process.env.ASPEN_BROKER_DIR ?? process.env.GITDESK_BROKER_DIR
    if (typeof envDir === 'string' && envDir.trim().length > 0) add(envDir.trim())
    else add(defaultQueueDir())
    for (const dir of legacyQueueDirs()) if (existsSync(dir)) add(dir)
  }

  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
    if (pkg?.name === 'aspen') {
      add(join(projectRoot, '.userdata-dev', 'git-broker'))
      const profile = process.env.ASPEN_PROFILE ?? process.env.GITDESK_PROFILE
      if (typeof profile === 'string' && profile.length > 0) add(join(profile, 'git-broker'))
    }
  } catch {
    /* not an Aspen checkout — only the configured queue */
  }
  return [...roots]
}

const queues = collectQueues()
const primaryQueue = queues[0]
const gitBin = typeof flags.git === 'string' && flags.git.length > 0 ? flags.git : 'git'
const pollMs = Math.max(20, Number.parseInt(flags.poll, 10) || 150)
const idleExitMs = Math.max(0, Number.parseInt(flags['idle-exit'], 10) || 0)

const lockPath = join(primaryQueue, 'broker.lock')

function dirsOf(queue) {
  return {
    requests: join(queue, 'requests'),
    processing: join(queue, 'processing'),
    responses: join(queue, 'responses'),
    done: join(queue, 'done'),
    log: join(queue, 'broker.log')
  }
}

function log(message) {
  return appendFile(
    join(primaryQueue, 'broker.log'),
    `${new Date().toISOString()} ${message}\n`
  ).catch(() => undefined)
}

async function ensureDirs(queue) {
  const d = dirsOf(queue)
  for (const dir of [d.requests, d.processing, d.responses, d.done]) {
    await mkdir(dir, { recursive: true })
  }
}

/** Rotate the log once at startup rather than growing forever. */
async function rotateLogs() {
  for (const q of queues) {
    const d = dirsOf(q)
    try {
      const info = await stat(d.log)
      if (info.size > LOG_MAX_BYTES) await rename(d.log, `${d.log}.old`)
    } catch {
      /* no log yet */
    }
  }
}

/** A crash mid-request leaves claims behind; put them back for a rerun. */
async function reclaimOrphans(queue) {
  const d = dirsOf(queue)
  let names = []
  try {
    names = await readdir(d.processing)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    await rename(join(d.processing, name), join(d.requests, name)).catch(() => undefined)
  }
}

async function sweepQueue(queue) {
  const d = dirsOf(queue)
  const now = Date.now()
  const prune = async (dir, maxAgeMs) => {
    let names = []
    try {
      names = await readdir(dir)
    } catch {
      return
    }
    for (const name of names) {
      const full = join(dir, name)
      try {
        const info = await stat(full)
        if (now - info.mtimeMs > maxAgeMs) await unlink(full).catch(() => undefined)
      } catch {
        /* raced away */
      }
    }
  }
  await prune(d.responses, RESPONSE_MAX_AGE_MS)
  await prune(d.done, DONE_MAX_AGE_MS)
  // Stale *.tmp publishes only: a plain request here is *pending* work (the
  // app is still polling for it), and deleting it after an hour — e.g. while
  // the broker was busy on a long command — silently loses that command.
  try {
    const tmpNames = (await readdir(d.requests)).filter(n => n.endsWith('.tmp'))
    for (const name of tmpNames) {
      const full = join(d.requests, name)
      try {
        const info = await stat(full)
        if (now - info.mtimeMs > TMP_MAX_AGE_MS) await unlink(full).catch(() => undefined)
      } catch {
        /* raced away */
      }
    }
  } catch {
    /* requests dir unreadable */
  }
}

function pidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJsonAtomic(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value), 'utf8')
  await rename(`${path}.tmp`, path)
}

/**
 * Run one git command faithfully — success/failure semantics belong to the
 * app (it re-applies allowed exit codes), the broker only reports.
 */
function executeGit(req) {
  return new Promise(resolvePromise => {
    const maxOut =
      typeof req.maxOutputBytes === 'number' && req.maxOutputBytes > 0
        ? req.maxOutputBytes
        : DEFAULT_MAX_OUTPUT
    const timeoutMs =
      typeof req.timeoutMs === 'number' && req.timeoutMs > 0
        ? req.timeoutMs
        : DEFAULT_REQUEST_TIMEOUT_MS

    const env = { ...process.env }
    delete env.GIT_ASKPASS
    delete env.GIT_EXTERNAL_DIFF
    delete env.GIT_PAGER
    delete env.EDITOR
    env.GIT_TERMINAL_PROMPT = '0'
    env.GIT_EDITOR = ':'
    if (req.env !== null && typeof req.env === 'object') {
      for (const [key, value] of Object.entries(req.env)) {
        if (typeof value === 'string') env[key] = value
      }
    }

    let child
    try {
      child = spawn(gitBin, req.args, {
        cwd: typeof req.cwd === 'string' && existsSync(req.cwd) ? req.cwd : undefined,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (err) {
      resolvePromise({
        ok: false,
        error: `Failed to start ${gitBin}: ${err?.message ?? String(err)}`,
        exitCode: -1,
        stdout: '',
        stderr: ''
      })
      return
    }

    const out = []
    const err = []
    let outBytes = 0
    let errBytes = 0
    let truncatedStdout = false
    let truncatedStderr = false
    let timedOut = false
    let settled = false

    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(result)
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout?.on('data', d => {
      outBytes += d.length
      if (outBytes > maxOut) {
        truncatedStdout = true
        child.kill()
      } else {
        out.push(d)
      }
    })
    child.stderr?.on('data', d => {
      errBytes += d.length
      if (errBytes > maxOut) {
        truncatedStderr = true
        child.kill()
      } else {
        err.push(d)
      }
    })
    child.stderr?.on('error', () => undefined)
    child.stdin?.end(typeof req.input === 'string' ? req.input : '')

    child.on('error', e => {
      finish({
        ok: false,
        error: `Failed to run ${gitBin}: ${e.message}`,
        exitCode: -1,
        stdout: '',
        stderr: ''
      })
    })

    child.on('close', code => {
      finish({
        ok: true,
        exitCode: code ?? -1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        ...(timedOut ? { timedOut: true } : {}),
        ...(truncatedStdout ? { truncatedStdout: true } : {}),
        ...(truncatedStderr ? { truncatedStderr: true } : {})
      })
    })
  })
}

async function processRequest(queue, stem) {
  const d = dirsOf(queue)
  const runPath = join(d.processing, `${stem}.json`)
  const startedAt = new Date().toISOString()
  let req
  try {
    req = await readJson(runPath)
  } catch (err) {
    await writeJsonAtomic(join(d.responses, `${stem}.json`), {
      id: stem,
      ok: false,
      exitCode: -1,
      stdout: '',
      stderr: '',
      error: `Invalid request JSON: ${err?.message ?? String(err)}`,
      startedAt,
      finishedAt: new Date().toISOString()
    })
    await rename(runPath, join(d.done, `${stem}.json`)).catch(() => undefined)
    return
  }

  const valid =
    req !== null &&
    typeof req === 'object' &&
    Array.isArray(req.args) &&
    req.args.every(a => typeof a === 'string') &&
    typeof req.cwd === 'string'

  const outcome = valid
    ? await executeGit(req)
    : {
        ok: false,
        error: 'Request must carry string args and a cwd string',
        exitCode: -1,
        stdout: '',
        stderr: ''
      }

  await writeJsonAtomic(join(d.responses, `${stem}.json`), {
    id: typeof req?.id === 'string' ? req.id : stem,
    ...outcome,
    startedAt,
    finishedAt: new Date().toISOString()
  })
  await rename(runPath, join(d.done, `${stem}.json`)).catch(() => undefined)
  await appendFile(
    d.log,
    `${new Date().toISOString()} ran ${stem}: ${gitBin} ${(valid ? req.args : []).join(' ')} -> ${
      outcome.ok === false ? `error: ${outcome.error}` : `exit ${outcome.exitCode}`
    }\n`
  ).catch(() => undefined)
}

/** Claim by rename, then run — concurrent brokers can never double-run one. */
async function drainQueue(queue) {
  const d = dirsOf(queue)
  let names = []
  try {
    names = await readdir(d.requests)
  } catch {
    return 0
  }
  let processed = 0
  for (const name of names.sort()) {
    if (!name.endsWith('.json') || name.endsWith('.tmp')) continue
    const stem = name.slice(0, -'.json'.length)
    try {
      await rename(join(d.requests, name), join(d.processing, name))
    } catch {
      continue // another broker claimed it first
    }
    await processRequest(queue, stem)
    processed += 1
  }
  return processed
}

async function drainAll() {
  let n = 0
  for (const q of queues) n += await drainQueue(q)
  return n
}

async function statusReport() {
  for (const q of queues) {
    let state = 'absent'
    let detail = ''
    try {
      const info = await stat(join(q, 'broker.lock'))
      const ageMs = Date.now() - info.mtimeMs
      let pid = 0
      try {
        pid = Number((await readJson(join(q, 'broker.lock'))).pid) || 0
      } catch {
        /* lock unreadable */
      }
      state = ageMs < LOCK_STALE_MS && pidAlive(pid) ? 'running' : 'stale'
      detail = ` pid=${pid} lastHeartbeat=${Math.round(ageMs / 1000)}s ago`
    } catch {
      /* no lock file */
    }
    let pending = 0
    try {
      pending = (await readdir(join(q, 'requests'))).filter(n => n.endsWith('.json')).length
    } catch {
      /* queue not created yet */
    }
    console.log(`git broker ${state}${detail}`)
    console.log(`queue: ${q}`)
    console.log(`pending requests: ${pending}`)
  }
  console.log(`git: ${gitBin}`)
}

async function manageTask(action) {
  if (process.platform !== 'win32') {
    console.log(
      `Task registration is a Windows feature; run the broker directly instead: node ${scriptPath}`
    )
    return
  }
  const queueArgs = flags.queues.map(q => `--queue "${q}"`).join(' ')
  const tr = `"${process.execPath}" "${scriptPath}"${queueArgs.length > 0 ? ` ${queueArgs}` : ''}`
  const create = spawnSync(
    'schtasks.exe',
    action === 'install'
      ? ['/Create', '/F', '/TN', TASK_NAME, '/SC', 'ONLOGON', '/TR', tr]
      : ['/Delete', '/TN', TASK_NAME, '/F'],
    { encoding: 'utf8' }
  )
  process.stdout.write(create.stdout ?? '')
  process.stderr.write(create.stderr ?? '')
  if (action === 'install' && create.status === 0) {
    const run = spawnSync('schtasks.exe', ['/Run', '/TN', TASK_NAME], {
      encoding: 'utf8'
    })
    process.stdout.write(run.stdout ?? '')
    process.stderr.write(run.stderr ?? '')
    console.log(
      `The broker now runs at every logon at normal integrity. Queues served:\n  ${queues.join('\n  ')}\nUninstall: node scripts/git-broker.mjs --uninstall-task`
    )
  } else if (action === 'install') {
    console.log(
      'Could not register the logon task (this shell may itself be sandboxed). Run: npm run git-broker:install  from a normal terminal.'
    )
  }
  process.exitCode = create.status ?? 1
}

async function main() {
  if (flags['install-task']) return manageTask('install')
  if (flags['uninstall-task']) return manageTask('uninstall')
  if (flags.status) return statusReport()

  for (const q of queues) {
    await ensureDirs(q)
    await reclaimOrphans(q)
    await sweepQueue(q)
  }
  await rotateLogs()

  if (flags.once) {
    const n = await drainAll()
    console.log(`processed ${n} request${n === 1 ? '' : 's'}`)
    return
  }

  // Single instance: refuse to double-poll while another broker is alive.
  try {
    const other = await readJson(lockPath)
    const fresh = Date.now() - (await stat(lockPath)).mtimeMs < LOCK_STALE_MS
    if (fresh && pidAlive(Number(other.pid)) && Number(other.pid) !== process.pid) {
      console.log(`git broker already running as pid ${other.pid}; this instance exits.`)
      return
    }
  } catch {
    /* no lock yet */
  }
  await writeJsonAtomic(lockPath, {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    node: process.execPath,
    script: scriptPath,
    queues
  })
  await log(`broker started (pid ${process.pid}) queues=${queues.join(', ')} git=${gitBin}`)

  const stop = () => {
    unlink(lockPath).catch(() => undefined)
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  let lastActivity = Date.now()
  let cycles = 0
  for (;;) {
    const processed = await drainAll()
    if (processed > 0) lastActivity = Date.now()
    const now = new Date()
    await utimes(lockPath, now, now).catch(() => undefined)
    cycles += 1
    if (cycles % 300 === 0) for (const q of queues) await sweepQueue(q)
    if (idleExitMs > 0 && Date.now() - lastActivity > idleExitMs) {
      await log('idle exit')
      stop()
    }
    await new Promise(r => setTimeout(r, pollMs))
  }
}

main().catch(err => {
  console.error(`git-broker failed: ${err?.stack ?? err}`)
  process.exitCode = 1
})
