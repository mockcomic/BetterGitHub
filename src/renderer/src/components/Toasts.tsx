import type { JSX } from 'react'
import { useStore, useStoreState } from '../store'

export function Toasts(): JSX.Element | null {
  const state = useStoreState()
  const store = useStore()
  if (state.toasts.length === 0) return null

  return (
    <div className="toasts" aria-live="polite">
      {state.toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <div className="toast-body">
            <span className="toast-text">{t.text}</span>
            {t.actions !== undefined && t.actions.length > 0 && (
              <span className="toast-buttons">
                {t.actions.map(a => (
                  <button
                    key={a.label}
                    className="mini"
                    onClick={() => {
                      store.dismissToast(t.id)
                      a.onClick()
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            )}
          </div>
          <button
            className="toast-close"
            aria-label="Dismiss"
            onClick={() => store.dismissToast(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
