import { apply } from './apply.mjs'
apply([
  [`
.btn.ai {
  /* The violet signature lives with the button base above; this rule only
     keeps the AI verb's label from inheriting the tray's ink. */
  color: var(--ai);
}
`, ``],
  [`.btn.ai {
  background: var(--ai);
  border-color: var(--btn-border);
  color: var(--on-accent);
}`, `.btn.ai {
  background: var(--ai);
  border-color: var(--btn-border);
  color: var(--on-accent);
  /* The sparkle is a letterform in the label's own white, not a gold emoji: a
     color with no role may not ride in on a glyph. */
  font-variant-emoji: text;
}`]
])
