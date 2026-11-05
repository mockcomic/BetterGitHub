import type { JSX, ReactNode } from 'react'
import { useEffect, useId } from 'react'
import { contextMenuIsOpen } from './ContextMenu'

/**
 * The deeper-detail tooltip: the visible hint under a field carries what
 * the setting needs; the dot carries the full story (registration steps,
 * scopes, privacy notes) on hover or keyboard focus. Text-only by design —
 * a link inside would die the moment the pointer leaves the dot.
 */
export function InfoTip({ text }: { text: string }): JSX.Element {
  const id = useId()
  return (
    <span className="info-tip">
      <button
        type="button"
        className="info-dot"
        aria-label="More information"
        aria-describedby={id}
        onClick={e => e.preventDefault()}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="4.8" r="1.05" fill="currentColor" />
          <rect x="7.25" y="7.2" width="1.5" height="4.4" rx="0.75" fill="currentColor" />
        </svg>
      </button>
      <span role="tooltip" id={id} className="tip-bubble">
        {text}
      </span>
    </span>
  )
}

export function Dialog({
  title,
  children,
  footer,
  onClose,
  width = 480,
  maxWidth,
  bodyClass
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  width?: number
  /** Raises the .dialog cap for wide surfaces (documented variant). */
  maxWidth?: number
  /** Replaces the body's scroll/padding (the preferences two-pane). */
  bodyClass?: string
}): JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // A context menu above the dialog owns the first Escape.
      if (e.key === 'Escape' && !contextMenuIsOpen()) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="dialog-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog"
        style={{
          width,
          ...(maxWidth !== undefined ? { maxWidth: `min(92vw, ${maxWidth}px)` } : {})
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={bodyClass !== undefined ? `dialog-body ${bodyClass}` : 'dialog-body'}>
          {children}
        </div>
        {footer !== undefined && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
  tip
}: {
  label: string
  children: ReactNode
  hint?: string
  /** Deeper detail behind the info dot, on top of the visible hint. */
  tip?: string
}): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {tip !== undefined && <InfoTip text={tip} />}
      </span>
      {children}
      {hint !== undefined && <span className="field-hint">{hint}</span>}
    </label>
  )
}

