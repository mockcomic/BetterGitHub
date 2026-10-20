import { Menu, app } from 'electron'
import type { MenuAction } from '../shared/ipc'
import { MENU_ACTION_CHANNEL } from '../shared/ipc'
import { getMainWindow } from './windows'

function sendAction(action: MenuAction): void {
  getMainWindow()?.webContents.send(MENU_ACTION_CHANNEL, action)
}

/**
 * App menu mirroring the categories GitHub Desktop exposes (File/Edit/View/
 * Repository/History/Help); repository operations are forwarded to the
 * renderer as menu actions, the same pattern the original uses with menu item
 * indices.
 */
export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [{ role: 'close' }, { role: 'quit' }]
          } as Electron.MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Manage repositories…',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendAction('manage-repositories')
        },
        { label: 'Add local repository…', click: () => sendAction('add-repository') },
        { label: 'Clone repository…', click: () => sendAction('clone-repository') },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: isMac ? 'Cmd+,' : 'Ctrl+,',
          click: () => sendAction('show-preferences')
        },
        ...(isMac ? [] : [{ role: 'quit' } as Electron.MenuItemConstructorOptions])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Repository',
      submenu: [
        {
          label: 'Commit',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => sendAction('commit')
        },
        {
          label: 'Stage all',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => sendAction('stage-all')
        },
        {
          label: 'Unstage all',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => sendAction('unstage-all')
        },
        { type: 'separator' },
        {
          label: 'Stash all my changes',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendAction('stash-all')
        },
        {
          label: 'Edit latest commit…',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => sendAction('edit-last-commit')
        },
        {
          label: 'Undo latest commit',
          click: () => sendAction('undo-commit')
        },
        { type: 'separator' },
        { label: 'New branch…', click: () => sendAction('new-branch') },
        { label: 'Rename branch…', click: () => sendAction('rename-branch') },
        { label: 'Delete branch…', click: () => sendAction('delete-branch') },
        { type: 'separator' },
        {
          label: 'Fetch',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendAction('fetch')
        },
        {
          label: 'Pull',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendAction('pull')
        },
        {
          label: 'Push',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => sendAction('push')
        },
        { type: 'separator' },
        {
          label: 'View on GitHub',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => sendAction('view-on-github')
        },
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendAction('refresh')
        }
      ]
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Copy SHA of selected commit',
          click: () => sendAction('copy-sha')
        },
        {
          label: 'Create branch from selected commit…',
          click: () => sendAction('create-branch-from-commit')
        },
        {
          label: 'Revert selected commit…',
          click: () => sendAction('revert-commit')
        },
        {
          label: 'Cherry-pick selected commit…',
          click: () => sendAction('cherry-pick-commit')
        },
        { type: 'separator' },
        {
          label: 'View selected commit on GitHub',
          click: () => sendAction('view-on-github')
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About GitDesk',
          click: () => sendAction('show-about')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
