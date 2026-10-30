import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { store } from './store'
import { isThemeId, themeBase } from '../../shared/themes'
import './styles.css'

// Set the theme synchronously before first paint; store.init() refines it
// from saved settings. The cache is the last applied setting (written by
// store.applyTheme), so a saved custom palette never flashes through
// Primer; with no cache yet (first run) the OS preference decides.
/**
 * One-time localStorage rename: every `gitdesk.*` key (theme, last repo,
 * panel widths, draft messages, hint flags) is copied to its `aspen.*`
 * counterpart when no new-name value exists yet. The legacy keys are kept,
 * so rolling back to a GitDesk build preserves that experience too.
 */
try {
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i)
    if (key !== null && key.startsWith('gitdesk.')) {
      const next = 'aspen.' + key.slice('gitdesk.'.length)
      if (window.localStorage.getItem(next) === null) {
        window.localStorage.setItem(next, window.localStorage.getItem(key) as string)
      }
    }
  }
} catch {
  /* private-mode storage: nothing to migrate */
}
let cachedTheme: string | null = null
try {
  cachedTheme = window.localStorage.getItem('aspen.theme')
} catch {
  /* private-mode storage: fall back to the OS preference below */
}
const firstPaintTheme = isThemeId(cachedTheme) ? cachedTheme : 'system'
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.setAttribute(
  'data-theme',
  firstPaintTheme === 'system' ? (prefersDark ? 'dark' : 'light') : firstPaintTheme
)
document.documentElement.setAttribute(
  'data-theme-base',
  themeBase(firstPaintTheme, prefersDark)
)

// When main runs with the Window Controls Overlay — it enables one on
// Windows only, hiding the OS title bar so the title band in styles.css
// becomes the window's drag handle under the floating caption buttons —
// mark the document so those rules apply. The preload's static platform tag
// is the same signal main acted on; the web overlay API has no reliable
// `enabled` property to ask. Without the marker (macOS/Linux, the QA web
// shim) the band collapses and the layout is exactly as before.
if (window.aspen?.platform === 'win32') {
  document.documentElement.setAttribute('data-wco', '')
}

void store.init()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
