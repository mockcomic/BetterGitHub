import { apply } from './apply.mjs'
apply([
  [`/* ---------------------------------------------------------------- motion */
/* GitDesk moves to acknowledge something that happened, and now also to say
   which desk you are sitting at: controls answer the cursor, the switch
   indicator slides to the active view, panes travel in the direction you were
   heading, and floated layers arrive instead of blink in. Four tiers, all
   under 250 ms — the commit/push celebration below stays the one long moment.
   Transform, opacity, box-shadow only. */`, `/* ---------------------------------------------------------------- motion */
/* GitDesk moves the way GitHub Desktop moves: almost not at all. Controls
   answer the cursor with color alone, floated layers fade in at a hair of
   scale, the desk swap crossfades, a running operation spins, and a commit or
   push that lands throws confetti. Nothing lifts, travels, staggers or pops.
   Three tiers — 90/140/200 ms — and the one long celebration. */`],
  [`/* --- controls answer the cursor (the sanctioned hover-lift) ------------ */`, `/* --- controls answer the cursor, in color alone -------------------------- */`]
])
