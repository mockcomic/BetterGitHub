import type { JSX } from 'react'
import { useStoreState } from '../store'

export function Toasts(): JSX.Element {
  const state = useStoreState()
  return (
    <div className="toasts" aria-live="polite">
      {state.toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
