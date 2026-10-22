import { apply } from './apply.mjs'

apply([
  // Icon buttons: GitHub's answer is a background, not a lift.
  [`.icon-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}`, `.icon-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text);
}`],
  // Row arrival, pane travel, and the directional view transition: all cut.
  [`/* --- state changes read as events --------------------------------------- */

@keyframes row-in {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* Rows are keyed by path/sha/index, so this fires only when a row truly
   appears (a newly changed file slides in); a refresh that keeps the same
   rows does not re-animate. Bounded stagger over the list head via --row-i. */
.file-row,
.commit-row,
.stash-row {
  animation: row-in var(--motion-fast) var(--ease-arrive)
    calc(var(--row-i, 0) * 16ms) both;
}

.changes-list > :nth-child(1) {
  --row-i: 0;
}
.changes-list > :nth-child(2) {
  --row-i: 1;
}
.changes-list > :nth-child(3) {
  --row-i: 2;
}
.changes-list > :nth-child(4) {
  --row-i: 3;
}
.changes-list > :nth-child(5) {
  --row-i: 4;
}
.changes-list > :nth-child(6) {
  --row-i: 5;
}
.changes-list > :nth-child(7) {
  --row-i: 6;
}
.changes-list > :nth-child(n + 8) {
  --row-i: 6;
}

@keyframes view-in {
  from {
    opacity: 0;
    transform: translateX(var(--pane-from, 14px));
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* The desk re-settles when the tab changes; keyed on the view so React
   remounts and the entrance replays exactly once per switch, traveling the way
   you moved (html[data-nav-dir] flips --pane-from). While a View Transition is
   running it owns the movement, and this stays out of the way. */
.pane-enter {
  animation: view-in var(--motion-slide) var(--ease-arrive) both;
}

html[data-nav-dir='back'] .pane-enter {
  --pane-from: -14px;
}

.vt-run .pane-enter {
  animation: none;
}

/* --- the desk view swap, explained across states (View Transitions API) --- */

::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: var(--motion-slide);
  mix-blend-mode: normal;
}

::view-transition-old(root) {
  animation-name: vt-out-fwd;
  animation-timing-function: var(--ease-exit);
}

::view-transition-new(root) {
  animation-name: vt-in-fwd;
  animation-timing-function: var(--ease-arrive);
}

html[data-nav-dir='back']::view-transition-old(root) {
  animation-name: vt-out-back;
}

html[data-nav-dir='back']::view-transition-new(root) {
  animation-name: vt-in-back;
}`, `/* --- the desk view swap -------------------------------------------------- */

/* GitHub Desktop's lists do not animate their rows in: a newly changed file is
   simply there. The desk swap is a crossfade, not a journey — the tab moved,
   you are already looking at where it went. */
.pane-enter {
  animation: scrim-in var(--motion-fast) ease-out both;
}

::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: var(--motion-fast);
  animation-name: scrim-in;
  mix-blend-mode: normal;
}`],
  // The travel keyframes the crossfade no longer uses.
  [`@keyframes view-out {
  to {
    opacity: 0;
    transform: translateX(-14px);
  }
}

`, ``],
  [`@keyframes vt-in-fwd {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes vt-out-fwd {
  from {
    opacity: 1;
    transform: none;
  }
  to {
    opacity: 0;
    transform: translateX(-16px);
  }
}

@keyframes vt-in-back {
  from {
    opacity: 0;
    transform: translateX(-16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes vt-out-back {
  from {
    opacity: 1;
    transform: none;
  }
  to {
    opacity: 0;
    transform: translateX(16px);
  }
}

`, ``],
  // Ahead/behind numbers no longer pop; the digits changing is the news.
  [`/* Two digits changing is the news; a single pop acknowledges it. */
@keyframes count-pop {
  0% {
    transform: scale(0.82);
    color: var(--accent);
  }
  60% {
    transform: scale(1.06);
  }
  100% {
    transform: scale(1);
  }
}

/* The pop acknowledges the change, but never rewrites the number's own
   meaning: an increase is still the push color, a decrease the pull color. The
   count is git truth, so the pop rides the number's existing color instead of
   borrowing the view hue, and the tint comes from that color, never a grayer
   sibling. */
.count-pop {
  display: inline-block;
  animation: count-pop 240ms var(--ease-arrive) both;
}`, `/* Ahead/behind counts simply read differently when they change: GitHub
   Desktop never bounces a number to tell you it moved. */
.count-pop {
  display: inline-block;
}`],
  // The empty desk no longer slides in.
  [`@keyframes scrim-in {`, `@keyframes scrim-in {`],
  // Floated layers: fade and a hair of scale, no travel.
  [`@keyframes layer-in {
  from {
    opacity: 0;
    transform: translateY(-3px) scale(0.985);
  }`, `@keyframes layer-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }`],
  [`@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.97);
  }`, `@keyframes dialog-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }`],
  [`@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(14px);
  }`, `@keyframes toast-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }`],
  // Stash rows: the meta text GitHub Desktop actually renders.
  [`.stash-row.selected .stash-preview,
.stash-row.selected .stash-meta {
  color: var(--row-on-accent-muted);
}`, `.stash-row.selected .file-dir {
  color: var(--row-on-accent-muted);
}`],
  // The repository table's selection inverts like the queue's does.
  [`.repo-table-row.selected {
  background: var(--bg-selected);
}`, `.repo-table-row.selected,
.repo-table-row.selected .mono,
.repo-table-row.selected .muted,
.repo-table-row.selected .repo-name-text {
  color: var(--row-on-accent);
}

.repo-table-row.selected .repo-path-dir {
  color: var(--row-on-accent-muted);
}

.repo-table-row.selected .badge,
.repo-table-row.selected .repo-badge {
  color: var(--row-on-accent);
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.45);
}

.repo-table-row.selected input[type='checkbox'] {
  accent-color: #ffffff;
}`]
])
