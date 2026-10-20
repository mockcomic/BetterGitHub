import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { buildAppMenu } from './menu'
import { registerIpc } from './ipc'
import { applyTheme, createMainWindow, getMainWindow } from './windows'
import { getThemeSetting } from './settings'
import { initCrashLogging } from './diagnostics'
import { stopWatching } from './watcher'

if (process.env['ELECTRON_RENDERER_URL'] !== undefined) {
  app.setPath('userData', join(process.cwd(), '.userdata-dev'))
}

/**
 * Optional profile override. The single-instance lock is taken inside
 * `userData`, so pointing it somewhere else is what lets a second instance
 * run at all — useful for a portable profile, and how the screenshot QA pass
 * launches the rebuilt app beside a running one.
 */
const profileOverride = process.env['GITDESK_PROFILE']
if (profileOverride !== undefined && profileOverride !== '') {
  app.setPath('userData', profileOverride)
}

if (!app.requestSingleInstanceLock()) {
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
