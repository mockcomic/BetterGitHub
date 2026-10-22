import { apply } from './apply.mjs'
apply([
  [`color-mix(in srgb, var(--primary) 55%, transparent)`, `color-mix(in srgb, var(--success) 60%, transparent)`, 'all'],
  [`color-mix(in srgb, var(--primary) 0%, transparent)`, `color-mix(in srgb, var(--success) 0%, transparent)`, 'all']
])
