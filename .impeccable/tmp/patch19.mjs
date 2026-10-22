import { apply } from './apply.mjs'

apply([
  [`.btn:hover:not(:disabled) {
  background: var(--btn-bg-hover);
  border-color: var(--btn-border-hover);
}`, `.btn:hover:not(:disabled) {
  background: var(--btn-bg-hover);
  border-color: var(--btn-border-hover);
}

/* Pressed: GitHub Desktop's buttons darken one step and stay put. */
.btn:active:not(:disabled) {
  background: var(--btn-bg-active);
}`],
  [`.btn.primary:hover:not(:disabled) {
  background: var(--primary-hover);
  border-color: var(--btn-border);
}`, `.btn.primary:hover:not(:disabled) {
  background: var(--primary-hover);
  border-color: var(--btn-border);
}

.btn.primary:active:not(:disabled) {
  background: var(--accent-active);
}`],
  [`/* GitHub Desktop gives every desk the same chrome: one blue does all the
   interaction work, and the git facts keep their own colors. The per-desk hue
   tokens leave with the world that used them; the names stay as neutral aliases
   so rules that still read them resolve to Primer values. */

.app {
  --view-accent: var(--accent);
  --view-edge: var(--border);
  --view-selected: var(--bg-selected);
}

`, ``],
  [`  /* Centered guidance stays muted; the heading that names the pane is ink. */
  /* GitHub Desktop's empty pane is plain canvas with centered guidance. */
  background: var(--bg);
}

.diff-title {`, `  /* GitHub Desktop's empty pane is plain canvas with centered guidance: the
     heading that names the pane is ink, and only the guidance is muted. */
  background: var(--bg);
}

.empty-state h2 {
  color: var(--text);
}

.diff-title {`]
])
