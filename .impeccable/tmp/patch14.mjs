import { apply } from './apply.mjs'
apply([
  [`/* The desk's one authored motion: when Commit or Push truly succeeds, the
   verb that did it pops with a green ring and sheds a brief confetti
   burst tinted only with state colors. Bound to outcomes, never idle. */`, `/* The desk's one authored moment — GitHub Desktop celebrates a commit, and so
   does this. When Commit or Push truly succeeds, the verb that did it pops with
   a ring in Success Green (the verb itself is blue, so the ring must not be)
   and sheds a brief burst of confetti tinted only with state colors. Bound to
   outcomes, never idle. */`],
  [`    box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 55%, transparent);`, `    box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 60%, transparent);`],
  [`    box-shadow: 0 0 0 10px color-mix(in srgb, var(--primary) 0%, transparent);`, `    box-shadow: 0 0 0 10px color-mix(in srgb, var(--success) 0%, transparent);`],
  [`/* A commit empties the tray, so the verb is often already disabled mid-
   celebration; the success moment still plays at full strength. */
.btn.celebrating:disabled {
  opacity: 1;
}`, `/* A commit empties the tray, so the verb is often already disabled mid-
   celebration; it keeps its face and label so the moment plays at full
   strength rather than greying out under the confetti. */
.btn.celebrating:disabled {
  opacity: 1;
  background: var(--primary);
  border-color: var(--btn-border);
  color: var(--on-accent);
}`]
])
