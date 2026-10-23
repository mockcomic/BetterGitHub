import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'

/** Allowed span for a resizable panel, and the width it falls back to. */
export interface WidthRange {
  readonly min: number
  readonly max: number
  readonly def: number
}

export function clampWidth(value: number, range: WidthRange): number {
  return Math.min(range.max, Math.max(range.min, Math.round(value)))
}

interface ResizeHandleProps {
  /** Which neighbour the handle drags: the pane before or after it. */
  readonly side: 'prev' | 'next'
  readonly range: WidthRange
  readonly label: string
  /** The panel's flex-basis variable, set on the shared .work-area parent. */
  readonly cssVar: string
  /** The committed width, or null while the pane follows the CSS defaults. */
  readonly width: number | null
  /** Persist once the gesture ends (and immediately for keypresses). */
  readonly onCommit: (width: number | null) => void
}

/** Arrow-key step; Shift steps further. */
const KEY_STEP = 8
const KEY_STEP_FAST = 40

/**
 * The draggable hairline between the desk's zones — it resizes the queue
 * column on one side of the work area and the commit tray on the other.
 *
 * The drag mutates the layout variable straight on the .work-area parent
 * instead of pushing per-frame state through the app, so a 3 000-line diff
 * never reconciles mid-gesture; the committed width reaches React state only
 * when the pointer is released. Pointer capture keeps the drag alive when the
 * cursor races past the 5px strip, arrow keys move the divider for the
 * keyboard, and Home / double-click hand the pane back to its responsive
 * default. `body.desk-resizing` holds the cursor and kills selection across
 * the window for the duration.
 */
export function ResizeHandle({
  side,
  range,
  label,
  cssVar,
  width,
  onCommit
}: ResizeHandleProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    lastWidth: number
  } | null>(null)

  /** The zone element whose width this handle controls. */
  const target = (): HTMLElement | null => {
    const el = ref.current
    const sibling = side === 'prev' ? el?.previousElementSibling : el?.nextElementSibling
    return sibling instanceof HTMLElement ? sibling : null
  }

  /** Write the width onto the shared parent, bypassing React while dragging. */
  const apply = (value: number | null): void => {
    const parent = ref.current?.parentElement
    if (!parent) return
    if (value === null) parent.style.removeProperty(cssVar)
    else parent.style.setProperty(cssVar, `${value}px`)
    setLiveWidth(value)
  }

  /** The width right now: inline value, else the rendered pane, else default. */
  const currentWidth = (): number => {
    const inline = ref.current?.parentElement?.style.getPropertyValue(cssVar)
    const parsed = inline !== undefined ? Number.parseFloat(inline) : Number.NaN
    if (Number.isFinite(parsed)) return parsed
    const measured = target()?.getBoundingClientRect().width
    return measured ?? width ?? range.def
  }

  // A view swap or unmount mid-gesture must not leave the window stuck in
  // the resizing state.
  useEffect(() => {
    return () => document.body.classList.remove('desk-resizing')
  }, [])

  const beginDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = currentWidth()
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startWidth: start, lastWidth: start }
    document.body.classList.add('desk-resizing')
  }

  const moveDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (d === null || d.pointerId !== e.pointerId) return
    const delta = e.clientX - d.startX
    // Dragging the divider right widens a left-docked pane and narrows a
    // right-docked one — the gesture always reads as moving the wall itself.
    const raw = side === 'prev' ? d.startWidth + delta : d.startWidth - delta
    d.lastWidth = clampWidth(raw, range)
    apply(d.lastWidth)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (d === null || d.pointerId !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    document.body.classList.remove('desk-resizing')
    onCommit(d.lastWidth)
  }

  const keys = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Home') {
      e.preventDefault()
      apply(null)
      onCommit(null)
      return
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? KEY_STEP_FAST : KEY_STEP)
    const raw = side === 'prev' ? currentWidth() + step : currentWidth() - step
    const next = clampWidth(raw, range)
    apply(next)
    onCommit(next)
  }

  const reset = (): void => {
    apply(null)
    onCommit(null)
  }

  const shown = liveWidth ?? width

  return (
    <div
      ref={ref}
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      {...(shown !== null
        ? {
            'aria-valuenow': shown,
            'aria-valuemin': range.min,
            'aria-valuemax': range.max
          }
        : {})}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={reset}
      onKeyDown={keys}
      title={`${label} — drag to resize, double-click to reset`}
    />
  )
}
