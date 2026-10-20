import type { JSX, ReactNode } from 'react'
import { useEffect } from 'react'

export function Dialog({
  title,
  children,
  footer,
  onClose,
  width = 480,
  maxWidth
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  width?: number
  /** Raises the .dialog cap for wide surfaces (documented variant). */
  maxWidth?: number
}): JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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
        <div className="dialog-body">{children}</div>
        {footer !== undefined && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({
  label,
  children,
  hint
}: {
  label: string
  children: ReactNode
  hint?: string
}): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint !== undefined && <span className="field-hint">{hint}</span>}
    </label>
  )
}

