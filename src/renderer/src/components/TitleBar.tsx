import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { call } from '../api'

/**
 * The Windows title band. Under the Window Controls Overlay (win32 only,
 * src/main/windows.ts) the OS title bar is hidden and the caption buttons
 * float over this strip's right edge, so the band is the window's drag
 * handle — and, with the classic menu bar auto-hidden, also where the
 * menus live: the top-level labels come from main's menu template and
 * click opens the same native popup menu. Interactive children opt back
 * out of the drag region (see styles.css). Rendered unconditionally and
 * collapsed to nothing by CSS (`display: none`) on every other platform
 * and in the QA web shim, which never sets data-wco.
 */
export function TitleBar(): JSX.Element {
  const [labels, setLabels] = useState<ReadonlyArray<string>>([])
  useEffect(() => {
    let alive = true
    call('getMenuLabels')
      .then(next => {
        if (alive) setLabels(next)
      })
      .catch(() => {
        /* menu not built yet: the wordmark alone still reads fine */
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="titlebar" aria-hidden="true">
      <span className="titlebar-label">GitDesk</span>
      {labels.length > 0 && (
        <div className="titlebar-menu">
          {labels.map(label => (
            <button
              key={label}
              type="button"
              className="titlebar-item"
              onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect()
                // Ask main to open the native menu just below the label.
                void call('popupMenu', label, rect.left, rect.bottom).catch(
                  () => undefined
                )
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
