import { join } from 'path'
import { BrowserWindow, nativeTheme } from 'electron'
import { logDiagnostics } from './diagnostics'

let mainWindow: BrowserWindow | null = null

const trustedWebContents = new Set<number>()

export function createMainWindow(devServerUrl: string | undefined): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#1c2128',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  trustedWebContents.add(window.webContents.id)

  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl) => {
      logDiagnostics(
        `did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedUrl}`
      )
    }
  )
  window.webContents.on(
    'render-process-gone',
    (_event, details) => {
      logDiagnostics(
        `window render-process-gone: reason=${details.reason}`
      )
    }
  )
  window.webContents.on('unresponsive', () => {
    logDiagnostics('window unresponsive')
  })
  window.webContents.on('did-finish-load', () => {
    logDiagnostics(`window did-finish-load: ${window.webContents.getURL()}`)
  })
  window.webContents.on(
    'console-message',
    (
      _event,
      level: unknown,
      message: string,
      lineNumber: number,
      sourceId: string
    ) => {
      const levelName = String(level).toLowerCase()
      if (levelName.includes('error') || levelName.includes('warn')) {
        logDiagnostics(
          `renderer console (${levelName}) ${sourceId}:${lineNumber}: ${message}`
        )
      }
    }
  )

  window.on('closed', () => {
    trustedWebContents.delete(window.webContents.id)
    if (mainWindow === window) mainWindow = null
  })

  if (devServerUrl !== undefined) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = window
  return window
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow : null
}

export function isTrustedSender(webContentsId: number): boolean {
  return trustedWebContents.has(webContentsId)
}

export function applyTheme(theme: 'system' | 'light' | 'dark'): void {
  nativeTheme.themeSource = theme
}
