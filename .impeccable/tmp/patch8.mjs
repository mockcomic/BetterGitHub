import { apply } from './apply.mjs'
apply([
  [`.repo-manager-row.selected .badge,
.repo-manager-row.selected .repo-badge {
  color: var(--row-on-accent);
  background: var(--on-accent-chip);
  border-color: var(--on-accent-chip-border);
}`, `.repo-manager-row.selected .badge,
.repo-manager-row.selected .repo-badge {
  color: var(--row-on-accent);
  background: var(--on-accent-chip);
  border-color: var(--on-accent-chip-border);
}

.repo-manager-row.selected input[type='checkbox'] {
  accent-color: var(--on-accent);
}`]
])
