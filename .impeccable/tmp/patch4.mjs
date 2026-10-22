import { apply } from './apply.mjs'

apply([
  [`  --motion-slide: 220ms;\n`, ``],
  [`.empty-state {
  animation: view-in var(--motion-layer) var(--ease-arrive) both;
}`, `.empty-state {
  animation: scrim-in var(--motion-fast) ease-out both;
}`],
  [`@keyframes count-pop {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}

/* ahead/behind numbers that just moved flag themselves. */
.count-pop {
  display: inline-block;
  animation: count-pop 240ms var(--ease-arrive) both;
}`, `/* Ahead/behind counts simply read differently when they change: GitHub Desktop
   never bounces a number to tell you it moved. */
.count-pop {
  display: inline-block;
}`],
  [`/* The × turns its head when the cursor reaches it: discard is a decision. */
.discard:hover {
  color: var(--danger);
  transform: rotate(90deg);
}`, `/* Discard is a decision, so the × says so in GitHub's red and nothing else. */
.discard:hover {
  color: var(--danger);
}`],
  [`.discard {
  transition:
    opacity var(--motion-fast) ease-out,
    color var(--motion-instant) ease-out,
    transform var(--motion-fast) var(--ease-arrive);
}`, `.discard {
  transition:
    opacity var(--motion-fast) ease-out,
    color var(--motion-instant) ease-out;
}`],
  [`/* Selection is the green Selected Surface; hover must not wash it out. */
.repo-manager-row.selected {
  background: var(--bg-selected);
}

.repo-manager-row.selected:hover {
  background: color-mix(in srgb, var(--bg-selected) 88%, var(--bg-hover));
}`, `/* Selection is GitHub's accent, and the row inverts to white on it exactly as
   the queue's rows do; hover deepens the accent instead of washing it out. */
.repo-manager-row.selected {
  background: var(--bg-selected);
  color: var(--row-on-accent);
}

.repo-manager-row.selected:hover {
  background: var(--accent-hover);
}

.repo-manager-row.selected .repo-path-dir,
.repo-manager-row.selected .repo-cell {
  color: var(--row-on-accent-muted);
}

.repo-manager-row.selected .repo-path-leaf,
.repo-manager-row.selected .repo-name-text {
  color: var(--row-on-accent);
}

.repo-manager-row.selected .badge,
.repo-manager-row.selected .repo-badge {
  color: var(--row-on-accent);
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.45);
}`],
  [`/* Keyboard cursor: the Beacon Blue border is the only active signal. */`, `/* Keyboard cursor: the accent border is the only active signal. */`],
  [`.repo-table-head input[type='checkbox'],
.repo-check-cell input[type='checkbox'] {
  width: auto;
  accent-color: var(--primary);`, `.repo-table-head input[type='checkbox'],
.repo-check-cell input[type='checkbox'] {
  width: auto;
  accent-color: var(--accent-emphasis);`],
  [`/* The checkbox speaks when the pointer or the keyboard cursor arrives, and
   stays at rest otherwise; the green surface carries the selected state. */`, `/* The checkbox speaks when the pointer or the keyboard cursor arrives, and
   stays at rest otherwise; the accent surface carries the selected state. */`],
  [`@media (prefers-reduced-motion: reduce) {
  /* Strip travel and scale; fades stay so arrivals and state are still
     acknowledged, and color feedback never depended on motion anyway.
     Spinners (the machine-thinking signal) keep running. */
  .btn:hover:not(:disabled),
  .btn:active:not(:disabled) {
    transform: none;
  }

  .icon-btn:hover:not(:disabled) {
    transform: none;
  }

  .popover,
  .context-menu,
  .dialog,
  .toast,
  .pane-enter,
  .file-row,
  .commit-row,
  .stash-row,
  .empty-state {
    animation-name: scrim-in;
  }

  /* The indicator jumps to its tab instead of sliding; its color change stays. */
  .desk-indicator {
    transition:
      background-color var(--motion-layer) ease-out,
      border-color var(--motion-layer) ease-out,
      box-shadow var(--motion-layer) ease-out,
      opacity var(--motion-fast) ease-out;
  }

  .file-row::before,
  .discard {
    transition: none;
  }

  .discard:hover {
    transform: none;
  }

  .tab-badge.danger {
    animation: none;
  }
`, `@media (prefers-reduced-motion: reduce) {
  /* Nothing travels in this world to begin with: the fades, the chip's
     arrival, and the spinner are all the motion there is, and all of them
     stay. */
  .popover,
  .context-menu,
  .dialog,
  .toast,
  .pane-enter,
  .empty-state {
    animation-name: scrim-in;
  }

  .discard {
    transition: none;
  }
`],
  [`  .celebrating .confetti-bit {
    animation: none;
  }

  .btn.celebrating {
    animation: none;
  }
`, `  .celebrating .confetti-bit {
    animation: none;
  }

  .btn.celebrating {
    animation: none;
  }
`]
])
