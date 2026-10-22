import { apply } from './apply.mjs'
apply([
  [`  background: color-mix(in srgb, var(--accent) 10%, var(--bg-panel));
  border-radius: 8px;`, `  background: var(--hunk-bg);
  border-radius: 6px;`],
  [`  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));`, `  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));`],
  [`  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;`, `  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;`],
  [`  border-radius: 8px;

.repo-table {`, `  border-radius: 6px;

.repo-table {`],
  [`  color: var(--text-muted);
  font-size: 15px;
  line-height: 1;`, `  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;`]
])
