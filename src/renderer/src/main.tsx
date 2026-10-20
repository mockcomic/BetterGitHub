import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { store } from './store'
import './styles.css'

// Set the theme synchronously before first paint; store.init() refines it
// from saved settings.
document.documentElement.setAttribute(
  'data-theme',
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
)

void store.init()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
