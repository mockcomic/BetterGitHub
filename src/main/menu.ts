import { Menu, app } from 'electron'
import type { MenuAction, MenuBarSpec, MenuEntrySpec, MenuRole } from '../shared/ipc'
import { MENU_ACTION_CHANNEL } from '../shared/ipc'
import { getMainWindow } from './windows'

function sendAction(action: MenuAction): void {
  getMainWindow()?.webContents.send(MENU_ACTION_CHANNEL, action)
}

/** Forward one action to the renderer's menu dispatcher (the title band's
 *  dropdowns reuse the exact route the native menu's clicks used). */
export function dispatchMenuAction(action: MenuAction): void {
  sendAction(action)
}

interface MenuEntry {
  readonly label?: string
  /** Electron accelerator for the native menu ('CmdOrCtrl+…'). The band's
   *  display hint is derived from it (win32 spelling — the band only shows
   *  there). */
  readonly accelerator?: string
  readonly action?: MenuAction
  readonly role?: MenuRole
  readonly separator?: boolean
  /** Hide from the win32 title band (e.g. the quit item mac shows inside
   *  the app menu instead). */
  readonly noBand?: boolean
}

interface TopMenu {
  readonly label: string
  readonly items: ReadonlyArray<MenuEntry>
}

/**
 * The one menu definition: categories mirror GitHub Desktop (File/Edit/View/
 * Repository/History/Help). It feeds the native application menu (accelerators
 * on win32, the real bar on macOS/Linux) *and* the themed win32 title-band
 * dropdowns, so the two can never drift apart.
 */
const MENUS: ReadonlyArray<TopMenu> = [
  {
    label: 'File',
    items: [
      {
        label: 'Manage repositories…',
        accelerator: 'CmdOrCtrl+T',
        action: 'manage-repositories'
      },
      { label: 'Add local repository…', action: 'add-repository' },
      { label: 'Clone repository…', action: 'clone-repository' },
      { separator: true },
      {
        label: 'Preferences',
        accelerator: 'CmdOrCtrl+,',
        action: 'show-preferences'
      },
      { label: 'Quit GitDesk', role: 'quit', accelerator: 'Alt+F4', noBand: false }
    ]
  },
  {
    label: 'Edit',
    items: [
      { label: 'Undo', role: 'undo', accelerator: 'Ctrl+Z' },
      { label: 'Redo', role: 'redo', accelerator: 'Ctrl+Y' },
      { separator: true },
      { label: 'Cut', role: 'cut', accelerator: 'Ctrl+X' },
      { label: 'Copy', role: 'copy', accelerator: 'Ctrl+C' },
      { label: 'Paste', role: 'paste', accelerator: 'Ctrl+V' },
      { label: 'Select All', role: 'selectAll', accelerator: 'Ctrl+A' }
    ]
  },
  {
    label: 'View',
    items: [
      { label: 'Reload', role: 'reload', accelerator: 'Ctrl+R' },
      { label: 'Toggle Developer Tools', role: 'toggleDevTools', accelerator: 'F12' },
      { separator: true },
      { label: 'Actual Size', role: 'resetZoom', accelerator: 'Ctrl+0' },
      { label: 'Zoom In', role: 'zoomIn', accelerator: 'Ctrl+Plus' },
      { label: 'Zoom Out', role: 'zoomOut', accelerator: 'Ctrl+-' },
      { separator: true },
      { label: 'Toggle Full Screen', role: 'togglefullscreen', accelerator: 'F11' }
    ]
  },
  {
    label: 'Repository',
    items: [
      { label: 'Commit', accelerator: 'CmdOrCtrl+Enter', action: 'commit' },
      {
        label: 'Stage all',
        accelerator: 'CmdOrCtrl+Shift+X',
        action: 'stage-all'
      },
      {
        label: 'Unstage all',
        accelerator: 'CmdOrCtrl+Shift+Z',
        action: 'unstage-all'
      },
      { separator: true },
      {
        label: 'Stash all my changes',
        accelerator: 'CmdOrCtrl+Shift+S',
        action: 'stash-all'
      },
      {
        label: 'Edit latest commit…',
        accelerator: 'CmdOrCtrl+Shift+M',
        action: 'edit-last-commit'
      },
      { label: 'Undo latest commit', action: 'undo-commit' },
      { separator: true },
      { label: 'New branch…', action: 'new-branch' },
      {
        label: 'Merge branch into current branch…',
        action: 'merge-branch'
      },
      { label: 'Rename branch…', action: 'rename-branch' },
      { label: 'Delete branch…', action: 'delete-branch' },
      { separator: true },
      {
        label: 'Fetch',
        accelerator: 'CmdOrCtrl+Shift+F',
        action: 'fetch'
      },
      {
        label: 'Pull',
        accelerator: 'CmdOrCtrl+Shift+P',
        action: 'pull'
      },
      {
        label: 'Push',
        accelerator: 'CmdOrCtrl+Shift+U',
        action: 'push'
      },
      { separator: true },
      {
        label: 'View on GitHub',
        accelerator: 'CmdOrCtrl+Shift+G',
        action: 'view-on-github'
      },
      {
        label: 'Refresh',
        accelerator: 'CmdOrCtrl+R',
        action: 'refresh'
      }
    ]
  },
  {
    label: 'History',
    items: [
      {
        label: 'Copy SHA of selected commit',
        action: 'copy-sha'
      },
      {
        label: 'Create branch from selected commit…',
        action: 'create-branch-from-commit'
      },
      { label: 'Revert selected commit…', action: 'revert-commit' },
      { label: 'Cherry-pick selected commit…', action: 'cherry-pick-commit' },
      { separator: true },
      {
        label: 'View selected commit on GitHub',
        action: 'view-on-github'
      }
    ]
  },
  {
    label: 'Help',
    items: [
      { label: 'About GitDesk', action: 'show-about' },
      { separator: true },
      { label: 'Donate via PayPal', action: 'donate' }
    ]
  }
]

/** 'CmdOrCtrl+X' -> 'Ctrl+X' — the band only ever shows on win32. */
function bandAccelerator(entry: MenuEntry): string | undefined {
  if (entry.accelerator === undefined) return undefined
  return entry.accelerator
    .replace('CmdOrCtrl', 'Ctrl')
    .replace('Ctrl+Plus', 'Ctrl++')
}

function toBandSpec(menu: TopMenu): MenuBarSpec {
  const items: MenuEntrySpec[] = menu.items.map(entry => ({
    label: entry.label,
    accelerator: bandAccelerator(entry),
    action: entry.action,
    role: entry.role,
    ...(entry.separator === true ? { separator: true } : {})
  }))
  return { label: menu.label, items }
}

/** The menu-bar contract for the win32 title band (components/TitleBar). */
export function getMenuBarSpec(): MenuBarSpec[] {
  return MENUS.map(toBandSpec)
}

/**
 * Execute a role item from the band dropdown — same WebContents/window
 * primitives Electron's hidden native bar runs for its own role items.
 */
export function runMenuRole(role: MenuRole): void {
  const window = getMainWindow()
  if (window === null) return
  const contents = window.webContents
  switch (role) {
    case 'undo':
      contents.undo()
      break
    case 'redo':
      contents.redo()
      break
    case 'cut':
      contents.cut()
      break
    case 'copy':
      contents.copy()
      break
    case 'paste':
      contents.paste()
      break
    case 'selectAll':
      contents.selectAll()
      break
    case 'reload':
      contents.reload()
      break
    case 'toggleDevTools':
      if (contents.isDevToolsOpened()) contents.closeDevTools()
      else contents.openDevTools()
      break
    case 'resetZoom':
      contents.setZoomFactor(1)
      break
    case 'zoomIn':
      contents.setZoomFactor(Math.min(3, contents.getZoomFactor() + 0.5))
      break
    case 'zoomOut':
      contents.setZoomFactor(Math.max(0.5, contents.getZoomFactor() - 0.5))
      break
    case 'togglefullscreen':
      window.setFullScreen(!window.isFullScreen())
      break
    case 'close':
      window.close()
      break
    case 'quit':
      app.quit()
      break
  }
}

/**
 * App menu mirroring the categories GitHub Desktop exposes. The declarative
 * MENUS above feeds it, so the native bar (macOS/Linux) and the themed win32
 * title-band dropdowns stay one source of truth; repository operations are
 * forwarded to the renderer as menu actions, the same pattern the original
 * uses with menu item indices.
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
    ...MENUS.map(
      menu =>
        ({
          label: menu.label,
          submenu: menu.items.map(entry => {
            if (entry.separator === true) return { type: 'separator' }
            if (entry.role !== undefined) {
              return { label: entry.label, role: entry.role }
            }
            return {
              label: entry.label,
              ...(entry.accelerator !== undefined
                ? { accelerator: entry.accelerator }
                : {}),
              click: () => {
                if (entry.action !== undefined) sendAction(entry.action)
              }
            }
          })
        }) as Electron.MenuItemConstructorOptions
    )
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
