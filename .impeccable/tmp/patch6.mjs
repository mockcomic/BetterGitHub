import { apply } from './apply.mjs'

apply([
  [`

@keyframes badge-arrive {
  0% {
    transform: scale(0.7);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger) 55%, transparent);
  }
  45% {
    transform: scale(1.12);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--danger) 30%, transparent);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger) 0%, transparent);
  }
}
`, ``],
  [`
  .count-pop {
    animation: none;
  }
`, ``]
])
