import { app, BrowserWindow } from 'electron'
import { buildAppMenu } from './menu'
import { registerIpc } from './ipc'
import { applyTheme, createMainWindow, getMainWindow } from './windows'
import { getThemeSetting } from './settings'
import { initCrashLogging } from './diagnostics'
import { stopWatching } from './watcher'
import { captureShots } from './shots'

// Debug-only capture path: GITDESK_SHOTS_DIR opens the window, captures
// the desk views as PNGs, and quits. Inert in normal use.
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = getMainWindow()
    if (window !== null) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  void app.whenReady().then(async () => {
    initCrashLogging()
    app.setAppUserModelId('com.kh.gitdesk')

    applyTheme(await getThemeSetting())
    registerIpc()
    buildAppMenu()
    createMainWindow(process.env['ELECTRON_RENDERER_URL'])

    const shotsDir = process.env['GITDESK_SHOTS_DIR']
    if (shotsDir !== undefined && shotsDir.length > 0) {
      const win = getMainWindow()
      if (win !== null) {
        win.webContents.once('did-finish-load', () => {
          setTimeout(() => {
            void captureShots(win, shotsDir).then(() => app.quit())
          }, 2500)
        })
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(process.env['ELECTRON_RENDERER_URL'])
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    stopWatching()
  })
}
