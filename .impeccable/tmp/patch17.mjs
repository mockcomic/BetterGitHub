import { apply } from './apply.mjs'

apply([
  // P0: the word tokens became self-referential when their literals were tokenized.
  [`  --word-add: var(--word-add);`, `  --word-add: rgba(128, 191, 132, 0.3);`, 'all'],
  [`  --word-del: var(--word-del);`, `  --word-del: rgba(255, 129, 130, 0.3);`, 'all'],
  [`  --word-del-strike: var(--word-del-strike);`, `  --word-del-strike: rgba(255, 129, 130, 0.6);`, 'all'],
  [`  --on-accent-chip: rgba(255, 255, 255, 0.16);`, `  --on-accent-chip: rgba(255, 255, 255, 0.1);`, 'all'],

  // P1: GitHub re-lights syntax per theme; the literals move into the blocks.
  [`  --ai: #8250df;`, `  --ai: #8250df;
  --ai-face: #8250df;
  --ai-face-hover: #6639ba;
  --chip-face: #ffffff;
  --bg-selected-hover: #0860ca;
  --syntax-comment: #6e7781;
  --syntax-keyword: #cf222e;
  --syntax-string: #0a3069;
  --syntax-constant: #0550ae;
  --syntax-function: #8250df;
  --syntax-entity: #953800;`],
  [`  --ai: #a371f7;`, `  --ai: #a371f7;
  --ai-face: #8250df;
  --ai-face-hover: #6e40c9;
  --chip-face: #21262d;
  --bg-selected-hover: #1f6feb;
  --syntax-comment: #8b949e;
  --syntax-keyword: #ff7b72;
  --syntax-string: #a5d6ff;
  --syntax-constant: #79c0ff;
  --syntax-function: #d2a8ff;
  --syntax-entity: #ffa657;`],
  [`  color: #8b949e;`, `  color: var(--syntax-comment);`],
  [`  color: #ff7b72;`, `  color: var(--syntax-keyword);`],
  [`  color: #a5d6ff;`, `  color: var(--syntax-string);`],
  [`  color: #79c0ff;`, `  color: var(--syntax-constant);`, 'all'],
  [`  color: #d2a8ff;`, `  color: var(--syntax-function);`],
  [`  color: #ffa657;`, `  color: var(--syntax-entity);`],

  // The AI verb is a face color; the agent's readout stays --ai text.
  [`  background: var(--ai);\n  border-color: var(--btn-border);`, `  background: var(--ai-face);\n  border-color: var(--btn-border);`],
  [`  background: var(--ai-hover);\n  border-color: var(--btn-border);`, `  background: var(--ai-face-hover);\n  border-color: var(--btn-border);`],

  // The desk-switch chip is a raised surface, not a hole in the rail.
  [`  background: var(--bg);\n  border-color: color-mix(in srgb, var(--accent) 40%, transparent);\n  color: var(--accent);`, `  background: var(--chip-face);\n  border-color: color-mix(in srgb, var(--accent) 40%, transparent);\n  color: var(--accent);`],
  [`  width: 1px;\n  border-radius: 6px;\n  background: var(--bg);`, `  width: var(--tab-w, 1px);\n  border-radius: 6px;\n  background: var(--chip-face);`],

  // P0: a selected conflicted row must not paint red on the accent.
  [`.file-row.conflicted {`, `.file-row.conflicted:not(.selected) {`],

  // P1: the hunk row tints its gutter like GitHub's blob view.
  [`.diff-line.hunk {
  background: var(--hunk-bg);
}`, `.diff-line.hunk {
  background: var(--hunk-bg);
}

.diff-line.hunk .lineno {
  background: var(--hunk-gutter);
}`],

  // The empty pane's heading is ink; only its guidance is muted.
  [`  text-align: center;
  color: var(--text-muted);
  padding: 40px;`, `  text-align: center;
  color: var(--text-muted);
  padding: 40px;
  /* Centered guidance stays muted; the heading that names the pane is ink. */`],
  [`.diff-title {`, `.empty-state h2 {
  color: var(--text);
}

.diff-title {`],

  // Primer's muted hairline is a token, not a hand-rolled mix.
  [`color-mix(in srgb, var(--border) 55%, transparent)`, `var(--border-subtle)`, 'all'],

  // Documented press states, shipped at last.
  [`.btn:hover:not(:disabled) {
  background: var(--btn-bg-hover);
}`, `.btn:hover:not(:disabled) {
  background: var(--btn-bg-hover);
}

.btn:active:not(:disabled) {
  background: var(--btn-bg-active);
}`],
  [`.btn.primary:hover:not(:disabled) {
  background: var(--primary-hover);
}`, `.btn.primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn.primary:active:not(:disabled) {
  background: var(--accent-active);
}`],
  [`.btn.primary.destructive:hover:not(:disabled) {
  background: var(--danger-face-hover);
}`, `.btn.primary.destructive:hover:not(:disabled) {
  background: var(--danger-face-hover);
}

.btn.primary.destructive:active:not(:disabled) {
  background: var(--danger-face-hover);
}`],

  // A selected row's hover deepens in light, and holds in dark: white on
  // Primer's lighter dark-hover blue would fall under AA.
  [`.file-row.selected:hover {
  background: var(--accent-hover);
}`, `.file-row.selected:hover {
  background: var(--bg-selected-hover);
}`],
  [`.commit-row.selected:hover {
  background: var(--accent-hover);
}`, `.commit-row.selected:hover {
  background: var(--bg-selected-hover);
}`],
  [`.stash-row.selected:hover {
  background: var(--accent-hover);
}`, `.stash-row.selected:hover {
  background: var(--bg-selected-hover);
}`],
  [`.repo-manager-row.selected:hover {
  background: var(--accent-hover);
}`, `.repo-manager-row.selected:hover {
  background: var(--bg-selected-hover);
}`],

  // The per-desk hue is gone; the aliases nothing reads go with it.
  [`/* The desk hues are gone: GitHub Desktop gives every desk the same chrome,
   so the tokens below stay neutral aliases rather than per-view palettes, in
   case an old rule or a component still reads them. */
.app {
  --view-accent: var(--accent);
  --view-edge: var(--border);
  --view-selected: var(--bg-selected);
}

`, ``],

  // Nothing animates opacity here; the celebration's face is what is held.
  [`.btn.celebrating:disabled {
  opacity: 1;
  background: var(--primary);`, `.btn.celebrating:disabled {
  background: var(--primary);`],

  // Dialog titles are the documented Headline step: 14px at 600, not the
  // browser's default bold.
  [`.dialog-head h2 {
  margin: 0;
  font-size: 14px;
}`, `.dialog-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}`],

  // The renderer never calls startViewTransition, so the desk swap is carried by
  // the keyed .pane-enter fade alone; these rules could only ever be fiction.
  [`::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: var(--motion-fast);
  animation-name: scrim-in;
  mix-blend-mode: normal;
}

`, ``]
])
