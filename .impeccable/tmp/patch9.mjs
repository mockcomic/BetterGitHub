import { apply } from './apply.mjs'
apply([
  [`    box-shadow var(--motion-instant) ease-out,
    transform var(--motion-instant) ease-out;`, `    box-shadow var(--motion-instant) ease-out;`],
  [`  border-radius: 5px;`, `  border-radius: 6px;`],
  [`  border-radius: 8px;
  padding: 9px 11px;`, `  border-radius: 6px;
  padding: 9px 11px;`],
  [`  border-radius: 8px;
  gap: 8px;
  padding: 8px 10px;`, `  border-radius: 6px;
  gap: 8px;
  padding: 8px 10px;`],
  [`  border-radius: 8px;

.repo-table {`, `  border-radius: 6px;

.repo-table {`],
  [`  background: var(--bg-inset);
  color: var(--text-muted);
  font-size: 10px;`, `  background: var(--bg-inset);
  color: var(--text-muted);
  font-size: 10.5px;`]
])
