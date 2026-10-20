import { app, BrowserWindow } from 'electron'
import { buildAppMenu } from './menu'
import { registerIpc } from './ipc'
import { applyTheme, createMainWindow, getMainWindow } from './windows'
import { getThemeSetting } from './settings'

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
}
