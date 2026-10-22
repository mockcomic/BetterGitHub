import { apply } from './apply.mjs'

apply([
  [`  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  padding: 4px;
}`, `  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 4px;
}`],
  [`.popover-item:hover {
  background: color-mix(in srgb, var(--view-accent) var(--tint), var(--bg-hover));
}`, `.popover-item:hover {
  background: var(--bg-hover);
}`],
  [`.popover-item.active {
  color: var(--primary);`, `.popover-item.active {
  color: var(--accent);`],
  [`  border-radius: 8px;
  box-shadow: var(--shadow);
  font-size: 13px;
  min-width: 180px;`, `  border-radius: 12px;
  box-shadow: var(--shadow);
  font-size: 13px;
  min-width: 180px;`],
  [`  border-right: 1px solid var(--view-edge);
  box-shadow: inset 2px 0 0 0 color-mix(in srgb, var(--view-accent) 45%, transparent);
  background: var(--bg-panel);`, `  border-right: 1px solid var(--border);
  background: var(--bg-panel);`],
  [`/* The four tabs sit on a rail and the active one is named by a sliding
   indicator (positioned in App.tsx, --tab-x/--tab-w) tinted with the view's
   own hue. Text weight carries the active tab too, so hue is never the only
   signal. */

.desk-switch {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex: 0 0 auto;
}`, `/* GitHub Desktop's segmented control: the active tab is a lifted chip on the
   subtle rail, named by its label color and weight as well as the chip, so
   hue is never the only signal. The chip jumps; it does not travel. */

.desk-switch {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  flex: 0 0 auto;
}`],
  [`.desk-tab:hover {
  background: color-mix(in srgb, var(--view-accent) var(--tint-row), var(--bg-hover));
  color: var(--text);
}`, `.desk-tab:hover {
  background: var(--bg-hover);
  color: var(--text);
}`],
  [`.desk-tab.active {
  color: var(--text);
  font-weight: 600;
}`, `.desk-tab.active {
  color: var(--accent);
  font-weight: 600;
}`],
  [`.tab-badge {
  font-family: var(--mono);
  font-size: 10.5px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--view-wash);
  border: 1px solid var(--view-edge);
  color: var(--view-accent);
}`, `/* Primer's counter: a bordered pill on the canvas, never a tinted blob. */
.tab-badge {
  font-family: var(--mono);
  font-size: 10.5px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--btn-border);
  color: var(--text-muted);
}`],
  [`.desk-tab.active .tab-badge {
  color: var(--view-accent);
  border-color: var(--view-edge);
}`, `.desk-tab.active .tab-badge {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}`],
  [`.tab-badge.danger {
  background: transparent;
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 38%, transparent);
  font-weight: 600;
  animation: badge-arrive var(--motion-layer) var(--ease-arrive) both;
}`, `.tab-badge.danger {
  background: var(--del-bg);
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 38%, transparent);
  font-weight: 600;
}`],
  [`.file-row:hover,
.file-row.selected {
  background: var(--bg-hover);
}`, `.file-row:hover {
  background: var(--bg-hover);
}`],
  [`/* A status rail on the row answers the cursor as well as the selection: hover
   says this is a decision, selection says you made it. */
.file-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: color-mix(in srgb, var(--row-status, var(--view-accent)) 60%, transparent);
  transform: scaleX(0);
  transform-origin: left;
}

.file-row:hover::before,
.file-row.selected::before,
.file-row:has(.status-d),
.file-row:has(.status-a),
.file-row:has(.status-conflict),
.file-row:has(.status-staged) {
  transform: scaleX(1);
}`, `/* GitHub Desktop names a file by its letter, not by a colored rail: the row's
   own hover and selection states carry the answer, so the status rail leaves
   with the world that introduced it. */`],
  [`.file-row.selected .file-name {
  color: var(--view-accent);
}`, `.file-row.selected .file-name {
  color: var(--row-on-accent);
}`],
  [`.file-check input {
  accent-color: var(--primary);
}`, `/* Staging is committing, so the box takes GitHub's green rather than the
   interaction blue every other control answers with. */
.file-check input {
  accent-color: var(--success);
}`],
  [`  border-left: 1px solid var(--view-edge);
  box-shadow: inset -2px 0 0 0 color-mix(in srgb, var(--view-accent) 45%, transparent);
  background: color-mix(in srgb, var(--view-accent) var(--tint), var(--bg-panel));`, `  border-left: 1px solid var(--border);
  background: var(--bg-panel);`],
  [`.queue-label {
  color: color-mix(in srgb, var(--view-accent) 60%, var(--text-muted));`, `.queue-label {
  color: var(--text-muted);`],
  [`.stash-detail-head {
  color: color-mix(in srgb, var(--view-accent) 45%, var(--text));`, `.stash-detail-head {
  color: var(--text);`],
  [`.commit-row:hover {
  background: color-mix(in srgb, var(--view-accent) var(--tint-row), var(--bg-hover));
}`, `.commit-row:hover {
  background: var(--bg-hover);
}`],
  [`.commit-row.selected {
  background: var(--bg-hover);
}

.commit-row.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent);
}`, `.commit-row.selected {
  background: var(--bg-selected);
}`],
  [`.commit-row.selected .commit-subject {
  color: var(--text);
}`, `.commit-row.selected .commit-subject {
  color: var(--row-on-accent);
}`],
  [`.stash-row:hover {
  background: color-mix(in srgb, var(--view-accent) var(--tint-row), var(--bg-hover));
}`, `.stash-row:hover {
  background: var(--bg-hover);
}`],
  [`.stash-row.selected {
  background: var(--bg-hover);
}`, `.stash-row.selected {
  background: var(--bg-selected);
}`],
  [`  /* An empty pane is the one place a quiet field of colour is allowed: one flat
     wash of the view's own hue says "this desk is ready", not "broken". */
  background: color-mix(in srgb, var(--view-accent) var(--field), var(--bg));`, `  /* GitHub Desktop's empty pane is plain canvas with centered guidance. */
  background: var(--bg);`],
  [`  background: color-mix(in srgb, var(--view-accent) var(--tint), var(--bg-header));
  border-bottom: 1px solid var(--view-edge);
  font-size: 12px;`, `  background: var(--bg-header);
  border-bottom: 1px solid var(--border);
  font-size: 12px;`],
  [`.lineno {
  width: 44px;
  text-align: right;
  padding-right: 8px;
  color: var(--text-muted);
  user-select: none;
  border-right: 1px solid var(--border);
}`, `.lineno {
  width: 44px;
  text-align: right;
  padding-right: 8px;
  color: var(--text-muted);
  user-select: none;
  background: var(--bg);
  border-right: 1px solid var(--border);
}`],
  [`.diff-line.add {
  background: var(--add-bg);
}`, `.diff-line.add {
  background: var(--add-bg);
}

.diff-line.add .lineno {
  background: var(--add-gutter);
  color: var(--add-text);
}`],
  [`.diff-line.del {
  background: var(--del-bg);
}`, `.diff-line.del {
  background: var(--del-bg);
}

.diff-line.del .lineno {
  background: var(--del-gutter);
  color: var(--del-text);
}`],
  [`.diff-line.hunk {
  background: var(--hunk-bg);
  font-weight: 600;
}`, `.diff-line.hunk {
  background: var(--hunk-bg);
  font-weight: 600;
}

.diff-line.hunk .lineno {
  background: var(--hunk-gutter);
  color: var(--hunk-text);
}`],
  [`.content .word-ins {
  background: color-mix(in srgb, var(--add-text) 32%, transparent);`, `.content .word-ins {
  background: rgba(128, 191, 132, 0.3);`],
  [`.content .word-del {
  background: color-mix(in srgb, var(--del-text) 30%, transparent);
  border-radius: 2px;
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--del-text) 60%, transparent);
}`, `.content .word-del {
  background: rgba(255, 129, 130, 0.3);
  border-radius: 2px;
  text-decoration: line-through;
  text-decoration-color: rgba(255, 129, 130, 0.6);
}`],
  [`  border-top: 1px solid var(--view-edge);
  background: color-mix(in srgb, var(--view-accent) var(--tint), var(--bg-header));`, `  border-top: 1px solid var(--border);
  background: var(--bg-panel);`],
  [`/* A hairline of the same hue travels the length of the busy item while the
   operation runs, and disappears the moment it is not the truth. */
.status-item.busy::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    currentColor,
    transparent
  );
  opacity: 0.5;
  animation: busy-sheen 1.2s linear infinite;
}

@keyframes busy-sheen {
  from {
    transform: translateX(-70%);
  }
  to {
    transform: translateX(70%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-item.busy::after {
    animation: none;
    opacity: 0.35;
  }
}
`, ``],
  [`  background: var(--scrim);
  /* The only blur in the app: the desk behind a dialog is present but silent. */
  backdrop-filter: blur(4px);
  display: flex;`, `  background: var(--scrim);
  display: flex;`],
  [`  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  max-width: min(92vw, 640px);`, `  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  max-width: min(92vw, 640px);`],
  [`  border-bottom: 1px solid var(--view-edge);
  background: color-mix(in srgb, var(--view-accent) var(--tint), var(--bg-header));
  border-radius: 10px 10px 0 0;`, `  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  border-radius: 12px 12px 0 0;`],
  [`.dialog-head h2 {
  margin: 0;
  font-size: 15px;
}`, `.dialog-head h2 {
  margin: 0;
  font-size: 14px;
}`],
  [`/* The agent's own hue answers the cursor in the same language as the commit
   verb, so the desk has one motion vocabulary for its two verbs. */
.btn.ai:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ai) 45%, var(--border));
  box-shadow:
    0 1px 3px var(--glow-hover),
    0 0 0 3px color-mix(in srgb, var(--ai) 20%, transparent);
}

/* The work area owns the whole middle column, and it owns the scroll. */`, `/* The work area owns the whole middle column, and it owns the scroll. */`],
  [`.toast {
  background: var(--bg);
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 8px;
  padding: 9px 12px;`, `.toast {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 9px 12px;`],
  [`/* The stripe names the severity; one flat wash of the same hue carries it over
   the card so a toast is legible in peripheral vision. */
.toast.error {
  border-left-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, var(--bg));
}

.toast.success {
  border-left-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, var(--bg));
}

.toast.info {
  border-left-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg));
}`, `/* GitHub's banners: the whole card takes the state's subtle ground and the
   label takes its strong tone, so severity reads at a glance and the color
   pairing is GitHub's own, never gray text on a colored field. */
.toast.error {
  background: var(--del-bg);
  border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
  color: var(--del-text);
}

.toast.success {
  background: var(--add-bg);
  border-color: color-mix(in srgb, var(--success) 35%, var(--border));
  color: var(--add-text);
}

.toast.info {
  background: var(--hunk-bg);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  color: var(--hunk-text);
}

.toast .btn {
  background: var(--bg);
}`],
  [`/* Scrollbars ride the view's hue, so a long queue reads as part of that desk. */
::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--view-accent) 32%, var(--border));
  border-radius: 5px;
}

::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--view-accent) 55%, var(--border));
}`, `/* The scrollbar is GitHub's neutral thumb: present when you scroll, invisible
   when you are reading. */
::-webkit-scrollbar-thumb {
  background: rgba(110, 118, 129, 0.4);
  border-radius: 6px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(110, 118, 129, 0.7);
}`],
  [`.app-banner {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  color: var(--accent);
  font-size: 12.5px;
}`, `.app-banner {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  background: var(--hunk-bg);
  color: var(--hunk-text);
  font-size: 12.5px;
}`],
  [`.app-banner.warning {
  border-bottom-color: color-mix(in srgb, var(--caution) 35%, var(--border));
  background: color-mix(in srgb, var(--caution) 10%, var(--bg));
  color: var(--caution);
}`, `.app-banner.warning {
  border-bottom-color: color-mix(in srgb, var(--caution) 35%, var(--border));
  background: color-mix(in srgb, var(--caution) 15%, var(--bg));
  color: var(--caution);
}`],
  [`  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-panel));
  color: var(--accent);
  padding: 8px 10px;`, `  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  background: var(--hunk-bg);
  color: var(--hunk-text);
  padding: 8px 10px;`],
  [`.onboarding h1 {
  font-size: 30px;
  margin: 0 0 8px;
  /* Solid ink: the wordmark does not need a gradient to be the brand, and the
     desk already says what colors mean. */
  color: var(--text);
}`, `.onboarding h1 {
  /* GitHub's own register for this line: a plain semibold heading, not a
     display moment. */
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text);
}`],
  [`.recent-repo:hover {
  background: var(--bg-hover);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}`, `.recent-repo:hover {
  background: var(--bg-hover);
  border-color: var(--btn-border-hover);
}`],
  [`.settings-tab.active {
  color: var(--view-accent);
  background: color-mix(in srgb, var(--view-accent) var(--tint-row), var(--bg));
  border-bottom-color: var(--view-accent);
}`, `.settings-tab.active {
  color: var(--accent);
  background: var(--bg);
  border-bottom-color: var(--accent);
}`],
  [`  transition: box-shadow var(--motion-fast) var(--ease-arrive);
}

.avatar:hover {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--bg-panel) 80%, var(--accent));
}`, `  background: var(--bg-inset);
  color: var(--text-muted);
  font-weight: 600;
}`],
  [`.repo-table-row.selected {
  background: color-mix(in srgb, var(--bg-selected) 88%, var(--bg-hover));
}`, `.repo-table-row.selected {
  background: var(--bg-selected);
}`]
])
