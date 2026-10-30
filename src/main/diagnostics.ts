import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { join } from 'path'

/**
 * Persistent diagnostics: main-process crashes and dead child/renderer
 * processes are appended to userData/aspen-crash.log so failures can be
 * diagnosed even when the terminal output is lost.
 */

export function logDiagnostics(message: string): void {
  try {
    const file = logFile()
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  } catch {
    // Diagnostics must never crash the app.
  }
}

function logFile(): string {
  return join(app.getPath('userData'), 'aspen-crash.log')
}

function describe(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function initCrashLogging(): void {
  process.on('uncaughtException', err => {
    logDiagnostics(`uncaughtException: ${describe(err)}`)
  })
  process.on('unhandledRejection', reason => {
    logDiagnostics(`unhandledRejection: ${describe(reason)}`)
  })
  app.on('child-process-gone', (_event, details) => {
    logDiagnostics(`child-process-gone: ${describe(details)}`)
  })
  app.on('render-process-gone', (_event, webContents, details) => {
    logDiagnostics(
      `render-process-gone (url=${webContents.getURL()}): ${describe(details)}`
    )
  })
  logDiagnostics(
    `main started (electron=${process.versions.electron}, chrome=${process.versions.chrome}, node=${process.versions.node})`
  )
}
