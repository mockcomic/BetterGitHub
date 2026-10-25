import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'

export interface ContextMenuItem {
  readonly label: string
  /** Omitted for submenu parents (`children` present instead). */
  readonly onSelect?: () => void
  readonly danger?: boolean
  readonly separatorBefore?: boolean
  readonly disabled?: boolean
  readonly title?: string
  /** Right-aligned shortcut hint (title-band menus; see styles.css). */
  readonly accelerator?: string
  /** Renders as a separator line only (label unused). */
  readonly separator?: boolean
  /** Group heading: rendered as a muted, non-clickable label. */
  readonly heading?: boolean
  /** One level of nesting: opened on hover/click as a side panel. */
  readonly children?: ReadonlyArray<ContextMenuItem>
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

/** Approximate rendered height of a menu list (30px rows + padding). */
function listHeight(items: ReadonlyArray<ContextMenuItem>): number {
  return items.length * 30 + 12
}

/** One entry: separator line, muted heading, or an actionable item button. */
function MenuEntry({
  item,
  showSeparator,
  submenuActive,
  onHover,
  onParentClick,
  onRun
}: {
  item: ContextMenuItem
  showSeparator: boolean
  submenuActive: boolean
  /** Called for every row hover; the owner opens/closes submenus. */
  onHover?: (item: ContextMenuItem, el: HTMLElement) => void
  /** Click on a submenu parent; the owner decides open vs. toggle-close. */
  onParentClick?: (item: ContextMenuItem, el: HTMLElement) => void
  onRun: () => void
}): JSX.Element {
  if (item.separator === true) {
    return <div className="popover-sep" />
  }
  if (item.heading === true) {
    return (
      <>
        {showSeparator && <div className="popover-sep" />}
        <div className="menu-heading" title={item.title}>
          {item.label}
        </div>
      </>
    )
  }
  const isParent = item.children !== undefined
  return (
    <>
      {showSeparator && <div className="popover-sep" />}
      <button
        role="menuitem"
        aria-haspopup={isParent ? 'menu' : undefined}
        aria-expanded={isParent ? submenuActive : undefined}
        disabled={item.disabled ?? false}
        title={item.title ?? item.label}
        className={`popover-item${item.danger === true ? ' danger' : ''}${
          isParent ? ' has-submenu' : ''
        }${submenuActive ? ' active' : ''}`}
        onMouseEnter={e => onHover?.(item, e.currentTarget)}
        onClick={e => {
          if (isParent) {
            if (onParentClick !== undefined) {
              onParentClick(item, e.currentTarget)
            } else {
              onHover?.(item, e.currentTarget)
            }
            return
          }
          onRun()
        }}
      >
        <span>{item.label}</span>
        {isParent ? (
          <span className="menu-accel">▸</span>
        ) : (
          item.accelerator !== undefined && (
            <span className="menu-accel">{item.accelerator}</span>
          )
        )}
      </button>
    </>
  )
}

/**
 * Lightweight right-click menu (GitHub Desktop's context menu for files and
 * commits). Reuses the popover styling and closes on outside click/Escape.
 * Items with `children` open a single-level side panel.
 */
export function ContextMenu({
  menu,
  onClose
}: {
  menu: ContextMenuState
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const [submenuPos, setSubmenuPos] = useState<{ left: number; top: number } | null>(null)
  /** Pending submenu close; cancelled when the pointer reaches the panel. */
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    openMenus += 1
    return () => {
      openMenus -= 1
    }
  }, [])

  const cancelSubmenuClose = (): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  // Unmount (menu closed, item clicked) must not leave a close pending.
  useEffect(() => cancelSubmenuClose, [])

  /**
   * Hover-intent: the panel closes only after the pointer has lingered on a
   * sibling row. Without the grace period, moving diagonally from the parent
   * crosses an adjacent row and the flyout dies before the cursor reaches it.
   */
  const scheduleSubmenuClose = (): void => {
    cancelSubmenuClose()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setOpenSubmenu(null)
    }, 250)
  }

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
  const x = Math.max(4, Math.min(menu.x, window.innerWidth - width - 4))
  const y = Math.max(4, Math.min(menu.y, window.innerHeight - listHeight(menu.items) - 4))

  const openSubmenuFor = (item: ContextMenuItem, el: HTMLElement): void => {
    const children = item.children ?? []
    const parent = el.getBoundingClientRect()
    const gap = 2
    let left = parent.right + gap
    if (left + width > window.innerWidth - 4) {
      left = Math.max(4, parent.left - width - gap)
    }
    const top = Math.max(
      4,
      Math.min(parent.top - 4, window.innerHeight - listHeight(children) - 4)
    )
    cancelSubmenuClose()
    setSubmenuPos({ left, top })
    setOpenSubmenu(item.label)
  }

  /**
   * Parent rows open (or re-open) their panel; sibling rows start the grace
   * period instead of closing it outright, so the diagonal path to an open
   * flyout stays alive.
   */
  const handleHover = (item: ContextMenuItem, el: HTMLElement): void => {
    if (item.children !== undefined) {
      openSubmenuFor(item, el)
    } else {
      scheduleSubmenuClose()
    }
  }

  /** Clicking an open parent toggles its panel closed. */
  const handleParentClick = (item: ContextMenuItem, el: HTMLElement): void => {
    if (openSubmenu === item.label) {
      cancelSubmenuClose()
      setOpenSubmenu(null)
    } else {
      openSubmenuFor(item, el)
    }
  }

  const submenu =
    openSubmenu === null
      ? null
      : menu.items.find(i => i.label === openSubmenu && i.children !== undefined)

  const separatorFor = (item: ContextMenuItem, i: number): boolean =>
    item.separator === true || (item.separatorBefore === true && i > 0)

  return (
    <div
      className="context-menu"
      ref={ref}
      style={{ left: x, top: y, minWidth: width }}
      role="menu"
    >
      {menu.items.map((item, i) => (
        <MenuEntry
          key={`${item.label}#${i}`}
          item={item}
          showSeparator={separatorFor(item, i)}
          submenuActive={openSubmenu === item.label}
          onHover={handleHover}
          onParentClick={handleParentClick}
          onRun={() => {
            onClose()
            item.onSelect?.()
          }}
        />
      ))}

      {submenu !== undefined && submenu !== null && submenuPos !== null && (
        <div
          className="context-menu context-submenu"
          role="menu"
          style={{ left: submenuPos.left, top: submenuPos.top, minWidth: width }}
          onMouseEnter={cancelSubmenuClose}
        >
          {submenu.children?.map((child, i) => (
            <MenuEntry
              key={`${child.label}#${i}`}
              item={child}
              showSeparator={separatorFor(child, i)}
              submenuActive={false}
              onRun={() => {
                onClose()
                child.onSelect?.()
              }}
            />
          ))}
        </div>
      )}
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
