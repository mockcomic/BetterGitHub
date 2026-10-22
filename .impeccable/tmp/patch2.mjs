import { apply } from './apply.mjs'

apply([
  [`  background: color-mix(in srgb, var(--view-accent) var(--tint), var(--bg-header));
  border-bottom: 1px solid var(--view-edge);
  flex: 0 0 auto;
}`, `  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}`],
  [`/* The command strip carries the active view's hue as one flat wash across its
   whole face, and its bottom hairline is tinted with it: the strip tells you
   which desk you are sitting at before you read a single label. */`, `/* GitHub Desktop's toolbar: the same subtle chrome as the queue and the tray,
   held off the work by one hairline. The strip is not tinted per desk; the
   active tab and the verb's color say what GitHub Desktop's says. */`],
  [`.desk-tab.active .tab-badge {
  background: color-mix(in srgb, var(--view-accent) 16%, var(--bg-panel));
}`, `.desk-tab.active .tab-badge {
  background: var(--bg);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  color: var(--accent);
}`],
  [`/* Conflicts arriving is an event: the badge announces itself once, then rests. */
.tab-badge.danger {
  animation: badge-arrive 420ms var(--ease-arrive) both;
}
`, ``],
  [`  color: color-mix(in srgb, var(--view-accent) 55%, var(--text-muted));
}`, `  color: var(--text-muted);
}`],
  [`/* A row's status hue grows a left rail when the cursor (or the selection)
   arrives: the file tells you what it is by what changed in it. */
.file-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 3px;
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: var(--view-accent);
  transform: scaleX(0);
  transform-origin: left center;
}

.file-row:hover::before,
.file-row.selected::before {
  transform: scaleX(1);
}

.file-row:has(.status-glyph.new)::before {
  background: var(--add-text);
}

.file-row:has(.status-glyph.deleted)::before {
  background: var(--del-text);
}

.file-row:has(.status-glyph.conflicted)::before {
  background: var(--danger);
}

.file-row:has(.status-glyph.renamed)::before,
.file-row:has(.status-glyph.copied)::before {
  background: var(--hunk-text);
}

.file-row:has(.status-glyph.modified)::before,
.file-row:has(.status-glyph.type-changed)::before {
  background: var(--caution);
}

.file-row:hover {
  background: color-mix(in srgb, var(--view-accent) var(--tint-row), var(--bg-hover));
}

.file-row.selected {
  background: var(--view-selected);
}`, `/* GitHub Desktop names a file by its letter, never by a colored rail: the
   letter already says what changed, so the row needs no second signal. */

.file-row:hover {
  background: var(--bg-hover);
}

/* A selected row inverts to white on GitHub's accent, exactly as GitHub
   Desktop's lists do. State survives the inversion because the glyph is a
   letter, not a color. */
.file-row.selected {
  background: var(--bg-selected);
  color: var(--row-on-accent);
}

.file-row.selected:hover {
  background: var(--accent-hover);
}

.file-row.selected .file-dir {
  color: var(--row-on-accent-muted);
}

.file-row.selected .status-glyph {
  color: var(--row-on-accent);
}

.file-row.selected .badge {
  color: var(--row-on-accent);
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.45);
}`],
  [`.file-row input[type='checkbox'] {
  width: auto;
  flex: 0 0 auto;
  accent-color: var(--primary);
}`, `/* Staging is committing, so the box answers in GitHub's green while every
   other control in the app answers in the interaction blue. */
.file-row input[type='checkbox'] {
  width: auto;
  flex: 0 0 auto;
  accent-color: var(--success);
}`],
  [`/* The sliding view indicator: transform + width only, on the arrival curve. */
.desk-indicator {
  position: absolute;
  z-index: 0;
  top: 6px;
  left: 0;
  height: calc(100% - 12px);
  width: 1px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--view-accent) 20%, var(--bg-panel));
  border: 1px solid var(--view-edge);
  box-shadow: var(--view-glow);
  transform: translateX(var(--tab-x, 0px));
  opacity: 0;
  pointer-events: none;
  transition:
    transform var(--motion-slide) var(--ease-arrive),
    width var(--motion-slide) var(--ease-arrive),
    background-color var(--motion-layer) ease-out,
    border-color var(--motion-layer) ease-out,
    box-shadow var(--motion-layer) ease-out,
    opacity var(--motion-fast) ease-out;
}`, `/* The selected-tab chip, positioned in App.tsx by --tab-x/--tab-w. It jumps to
   the active tab — GitHub Desktop has no travelling selection, so only its
   arrival is acknowledged, never a journey. */
.desk-indicator {
  position: absolute;
  z-index: 0;
  top: 6px;
  left: 0;
  height: calc(100% - 12px);
  width: 1px;
  border-radius: 6px;
  background: var(--bg);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: var(--btn-shadow);
  transform: translateX(var(--tab-x, 0px));
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-fast) ease-out;
}`],
  [`.commit-row.selected {
  background: var(--view-selected);
}`, `.commit-row.selected {
  background: var(--bg-selected);
  color: var(--row-on-accent);
}

.commit-row.selected:hover {
  background: var(--accent-hover);
}

.commit-row.selected .commit-meta {
  color: var(--row-on-accent-muted);
}

.commit-row.selected .badge {
  color: var(--row-on-accent);
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.45);
}`],
  [`/* Author avatars are lit with Beacon Blue — the interaction voice, since
   clicking one is a way to filter — and answer the cursor with a halo. */
.avatar {
  flex: 0 0 24px;
  height: 24px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 25%, var(--bg-panel));
  color: var(--accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow var(--motion-fast) var(--ease-arrive);
}

.commit-row:hover .avatar {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent),
    0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}`, `/* Avatars are GitHub's neutral discs: the initials stand in for a fetched
   photo, and nothing about them competes with the commit subject. */
.avatar {
  flex: 0 0 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-inset);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.commit-row.selected .avatar {
  background: rgba(255, 255, 255, 0.18);
  color: var(--row-on-accent);
}`],
  [`.stash-row.selected {
  background: var(--view-selected);
}`, `.stash-row.selected {
  background: var(--bg-selected);
  color: var(--row-on-accent);
}

.stash-row.selected:hover {
  background: var(--accent-hover);
}

.stash-row.selected .stash-preview,
.stash-row.selected .stash-meta {
  color: var(--row-on-accent-muted);
}`],
  [`/* Stashed work is Shelf Teal — its own hue, because a stash is neither a
   change in the worktree nor a commit: it is parked work. */
.stash-detail-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
  color: color-mix(in srgb, var(--view-accent) 45%, var(--text));
}`, `/* A stash is parked work, not a state of the worktree: it is named in plain
   ink, and only its verbs carry color. */
.stash-detail-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
  color: var(--text);
}`],
  [`  border-radius: 8px;
  box-shadow: var(--shadow);`, `  border-radius: 12px;
  box-shadow: var(--shadow);`],
  [`.app-banner {
  padding: 8px 14px;
  font-size: 12.5px;
  background: color-mix(in srgb, var(--danger) 12%, var(--bg-panel));
  border-bottom: 1px solid color-mix(in srgb, var(--danger) 40%, var(--border));
  color: var(--text);
  display: flex;`, `.app-banner {
  padding: 8px 14px;
  font-size: 12.5px;
  /* A GitHub banner: the state's own subtle ground, its strong tone for the
     text, and no gray label floating on a colored field. */
  background: var(--del-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border));
  color: var(--del-text);
  display: flex;`],
  [`.btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 1px 3px var(--glow-hover);
}

/* Pressed: the lift comes back down and the button takes the press — the
   hover is the answer, the click is the commitment. */
.btn:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
  box-shadow: none;
}`, `/* Hover and press answer with color alone, the way GitHub Desktop's buttons
   do: a control in a toolbar never moves out of its row. */`],
  [`.btn,
.icon-btn {
  transition:
    background-color var(--motion-instant) ease-out,
    border-color var(--motion-instant) ease-out,
    color var(--motion-instant) ease-out,
    box-shadow var(--motion-instant) ease-out,
    transform var(--motion-instant) ease-out;
}

.btn:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.btn.celebrating {
  animation: celebrate-pop 360ms var(--ease-arrive) both;
}

.icon-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  color: var(--text);
}`, `.btn:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

/* The celebration is GitHub Desktop's own: the commit lands, confetti flies.
   It is the one long moment in the app and the only thing that scales. */
.btn.celebrating {
  animation: celebrate-pop 360ms var(--ease-arrive) both;
}`],
  [`.mini:hover:not(:disabled),
.link:hover:not(:disabled) {
  color: var(--accent);
  transform: translateY(-1px);
}`, `.mini:hover:not(:disabled),
.link:hover:not(:disabled) {
  color: var(--accent);
}`],
  [`.icon-btn,
.mini,
.link {
  transition:
    color var(--motion-instant) ease-out,
    transform var(--motion-instant) ease-out;
}`, `.icon-btn,
.mini,
.link {
  transition: color var(--motion-instant) ease-out;
}`]
])
