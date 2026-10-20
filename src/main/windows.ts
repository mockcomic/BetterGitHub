import { join } from 'path'
import { BrowserWindow, nativeTheme } from 'electron'

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
