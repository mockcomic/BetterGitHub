import { apply } from './apply.mjs'
apply([
  [`.stash-row.selected .file-dir {
  color: var(--row-on-accent-muted);
}`, `.stash-row.selected .file-dir {
  color: var(--row-on-accent-muted);
}

/* The message and the row's own verbs ride the row's white: the red Drop verb
   would be illegible painted straight onto the accent. */
.stash-row.selected .stash-message {
  color: var(--row-on-accent);
}

.stash-row.selected .mini,
.file-row.selected .mini,
.commit-row.selected .mini {
  color: var(--row-on-accent-muted);
}

.stash-row.selected .mini:hover,
.file-row.selected .mini:hover,
.commit-row.selected .mini:hover {
  color: var(--row-on-accent);
}`]
])
