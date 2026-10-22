import { apply } from './apply.mjs'

apply([
  [`@keyframes badge-arrive {
  0% {
    transform: scale(0.7);
  }
  55% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

`, ``],
  [`/* The status rail answers the cursor at the same speed as the row wash. */
.file-row::before {
  transition: transform var(--motion-fast) var(--ease-arrive);
}

`, ``],
  [`  --ease-exit: cubic-bezier(0.4, 0, 1, 1);\n`, ``],
  [`   verb that did it pops with a Commit Green ring and sheds a brief confetti`, `   verb that did it pops with a green ring and sheds a brief confetti`],
  [`/* The machine-thinking signal: Beacon Blue, with the ring riding the item's own`, `/* The machine-thinking signal: the accent blue, with the ring riding the item's own`],
  [`/* The machine-thinking signal, on Beacon Blue like the status bar's busy item. */`, `/* The machine-thinking signal, in the same accent blue as the status bar's. */`]
])
