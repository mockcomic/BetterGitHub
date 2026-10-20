import type { JSX } from 'react'
import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  readonly label: string
  readonly onSelect: () => void
  readonly danger?: boolean
  readonly separatorBefore?: boolean
  readonly disabled?: boolean
  readonly title?: string
}

export interface ContextMenuState {
  readonly x: number
  readonly y: number
  readonly items: ReadonlyArray<ContextMenuItem>
}

/**
 * Escape belongs to the menu while one is on screen: dialogs consult this
 * instead of closing underneath it.
 */
let openMenus = 0

export function contextMenuIsOpen(): boolean {
  return openMenus > 0
}

/**
 * Lightweight right-click menu (GitHub Desktop's context menu for files and
 * commits). Reuses the popover styling and closes on outside click/Escape.
 */
export function ContextMenu({
  menu,
  onClose
}: {
  menu: ContextMenuState
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    openMenus += 1
    return () => {
      openMenus -= 1
    }
  }, [])

  useEffect(() => {
    const closeOnClick = (e: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) onClose()
    }
    const closeOnKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', closeOnClick)
    document.addEventListener('keydown', closeOnKey)
    return () => {
      document.removeEventListener('mousedown', closeOnClick)
      document.removeEventListener('keydown', closeOnKey)
    }
  }, [onClose])

  // Keep the menu inside the viewport.
  const width = 240
  const height = menu.items.length * 30 + 12
  const x = Math.max(4, Math.min(menu.x, window.innerWidth - width - 4))
  const y = Math.max(4, Math.min(menu.y, window.innerHeight - height - 4))

  return (
    <div
      className="context-menu"
      ref={ref}
      style={{ left: x, top: y, minWidth: width }}
      role="menu"
    >
      {menu.items.map((item, i) => (
        <div key={item.label}>
          {item.separatorBefore && i > 0 && <div className="popover-sep" />}
          <button
            role="menuitem"
            disabled={item.disabled ?? false}
            title={item.title ?? item.label}
            className={`popover-item${item.danger === true ? ' danger' : ''}`}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}

/** Returns a context-menu state from a mouse event, clamped to the window. */
export function menuStateFromEvent(
  e: { clientX: number; clientY: number },
  items: ReadonlyArray<ContextMenuItem>
): ContextMenuState {
  return { x: e.clientX, y: e.clientY, items }
}
