import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { call } from '../api'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu'
import type { MenuBarSpec, MenuEntrySpec } from '../../../shared/ipc'
import logoUrl from '../../../../resources/gitdesk-icon.svg'

/** Menu-bar entries → the shared dropdown primitive. Separators ride the
 *  next item as separatorBefore, exactly like the app's other menus. */
function toMenuItems(entries: ReadonlyArray<MenuEntrySpec>): ContextMenuItem[] {
  const out: ContextMenuItem[] = []
  let pendingSeparator = false
  for (const entry of entries) {
    if (entry.separator === true) {
      if (out.length > 0) pendingSeparator = true
      continue
    }
    out.push({
      label: entry.label ?? '',
      accelerator: entry.accelerator,
      separatorBefore: pendingSeparator,
      onSelect: () => {
        // Same routes the native menu bar's clicks took (src/main/menu.ts).
        if (entry.action !== undefined) {
          void call('triggerMenuAction', entry.action).catch(() => undefined)
        } else if (entry.role !== undefined) {
          void call('runMenuRole', entry.role).catch(() => undefined)
        }
      }
    })
    pendingSeparator = false
  }
  return out
}

interface OpenMenu {
  readonly label: string
  readonly state: ContextMenuState
}

/**
 * The Windows title band. Under the Window Controls Overlay (win32 only,
 * src/main/windows.ts) the OS title bar is hidden and the caption buttons
 * float over this strip's right edge, so the band is the window's drag
 * handle — and with the classic menu bar auto-hidden, also the menu bar:
 * the logo wordmark on the left, then File/Edit/View/… labels whose
 * dropdowns reuse the app's themed ContextMenu styling (Primer panels,
 * hover rows, shortcut hints) instead of the OS-drawn menu, so the top of
 * the window is fully themed like the rest of the desk. The entries come
 * from main's single menu definition (src/main/menu.ts), so accelerators
 * and behavior match the native menu on macOS/Linux. Interactive children
 * opt back out of the drag region (see styles.css). Rendered
 * unconditionally and collapsed to nothing by CSS (`display: none`)
 * elsewhere and in the QA web shim, which never sets data-wco.
 */
export function TitleBar(): JSX.Element {
  const [menus, setMenus] = useState<ReadonlyArray<MenuBarSpec>>([])
  const [open, setOpen] = useState<OpenMenu | null>(null)

  useEffect(() => {
    let alive = true
    call('getMenuBar')
      .then(next => {
        if (alive) setMenus(next)
      })
      .catch(() => {
        /* menu not built yet: the wordmark alone still reads fine */
      })
    return () => {
      alive = false
    }
  }, [])

  const openAt = (label: string, target: HTMLElement): void => {
    const rect = target.getBoundingClientRect()
    setOpen({ label, state: { x: rect.left, y: rect.bottom + 2, items: [] } })
  }

  const openMenu = menus.find(menu => menu.label === (open?.label ?? ''))
  const visible: OpenMenu | null =
    open !== null && openMenu !== undefined
      ? { label: open.label, state: { ...open.state, items: toMenuItems(openMenu.items) } }
      : null

  return (
    <div className="titlebar" aria-hidden="true">
      <img className="titlebar-logo" src={logoUrl} alt="" draggable={false} />
      <span className="titlebar-label">GitDesk</span>
      {menus.length > 0 && (
        <div className="titlebar-menu" role="menubar">
          {menus.map(menu => (
            <button
              key={menu.label}
              type="button"
              role="menuitem"
              className="titlebar-item"
              aria-haspopup="true"
              aria-expanded={open?.label === menu.label}
              onClick={event => {
                if (open?.label === menu.label) setOpen(null)
                else openAt(menu.label, event.currentTarget)
              }}
              onMouseEnter={event => {
                // Classic menu-bar behavior: once a menu is open, sliding
                // across the labels switches menus.
                if (open !== null && open.label !== menu.label) {
                  openAt(menu.label, event.currentTarget)
                }
              }}
            >
              {menu.label}
            </button>
          ))}
        </div>
      )}
      {visible !== null && (
        <ContextMenu menu={visible.state} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
