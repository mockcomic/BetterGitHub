import { apply } from './apply.mjs'

const lightTokens = `  --row-on-accent: #ffffff;
  --row-on-accent-muted: rgba(255, 255, 255, 0.82);
  /* A control or badge sitting on the accent keeps one set of alphas, and the
     word-level diff marks and the scrollbar keep theirs: literals stay in the
     token block, never in a component rule. */
  --on-accent: #ffffff;
  --on-accent-chip: rgba(255, 255, 255, 0.16);
  --on-accent-chip-border: rgba(255, 255, 255, 0.45);
  --word-add: rgba(128, 191, 132, 0.3);
  --word-del: rgba(255, 129, 130, 0.3);
  --word-del-strike: rgba(255, 129, 130, 0.6);
  --scroll-thumb: rgba(110, 118, 129, 0.4);
  --scroll-thumb-hover: rgba(110, 118, 129, 0.7);`

apply([
  [`  --row-on-accent: #ffffff;
  --row-on-accent-muted: rgba(255, 255, 255, 0.82);`, lightTokens],
  [`  --row-on-accent: #ffffff;
  --row-on-accent-muted: rgba(255, 255, 255, 0.8);`, `  --row-on-accent: #ffffff;
  --row-on-accent-muted: rgba(255, 255, 255, 0.8);
  --on-accent: #ffffff;
  --on-accent-chip: rgba(255, 255, 255, 0.16);
  --on-accent-chip-border: rgba(255, 255, 255, 0.45);
  --word-add: rgba(128, 191, 132, 0.3);
  --word-del: rgba(255, 129, 130, 0.3);
  --word-del-strike: rgba(255, 129, 130, 0.6);
  --scroll-thumb: rgba(110, 118, 129, 0.4);
  --scroll-thumb-hover: rgba(110, 118, 129, 0.7);`],
  [`color: #ffffff;`, `color: var(--on-accent);`, 'all'],
  [`accent-color: #ffffff;`, `accent-color: var(--on-accent);`, 'all'],
  [`background: rgba(255, 255, 255, 0.16);`, `background: var(--on-accent-chip);`, 'all'],
  [`border-color: rgba(255, 255, 255, 0.45);`, `border-color: var(--on-accent-chip-border);`, 'all'],
  [`background: rgba(255, 255, 255, 0.18);`, `background: var(--on-accent-chip);`, 'all'],
  [`rgba(128, 191, 132, 0.3)`, `var(--word-add)`, 'all'],
  [`rgba(255, 129, 130, 0.6)`, `var(--word-del-strike)`, 'all'],
  [`rgba(255, 129, 130, 0.3)`, `var(--word-del)`, 'all'],
  [`  background: rgba(110, 118, 129, 0.4);`, `  background: var(--scroll-thumb);`],
  [`  background: rgba(110, 118, 129, 0.7);`, `  background: var(--scroll-thumb-hover);`],
  [`  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: var(--btn-shadow);`, `  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: var(--btn-shadow);`]
])
