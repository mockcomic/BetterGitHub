// Runs a renderer state update inside a View Transition, so the desk explains
// where it moved: the outgoing view travels one way, the incoming view the
// other. The movement itself lives in styles.css (::view-transition-*, keyed
// by html[data-nav-dir]).
//
// Two graceful fallbacks, both of which leave the app fully usable:
//  - no View Transitions API: the update runs plainly and the keyed `.pane-enter`
//    entrance carries the movement instead;
//  - prefers-reduced-motion: no travel at all, so the update runs plainly and
//    the existing reduced-motion rules keep the fades and color state.
import { flushSync } from 'react-dom'

export type NavDirection = 'fwd' | 'back'

type TransitionDocument = Document & {
  startViewTransition?: (
    callback: () => void
  ) => { readonly finished: Promise<void> }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function withViewTransition(
  update: () => void,
  direction: NavDirection = 'fwd'
): void {
  const doc = document as TransitionDocument
  const root = document.documentElement
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    update()
    return
  }
  root.dataset.navDir = direction
  // The pane entrance would double up with the transition's own travel.
  root.classList.add('vt-run')
  const transition = doc.startViewTransition(() => {
    // The store is external to React, so the DOM has to be brought up to date
    // synchronously for the transition's "new" snapshot.
    flushSync(update)
  })
  void transition.finished.finally(() => {
    root.classList.remove('vt-run')
    // The direction is only meaningful while a transition is in flight; leaving
    // it set would make a later no-API fallback slide the wrong way.
    delete root.dataset.navDir
  })
}
