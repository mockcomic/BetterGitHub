import type { CSSProperties, JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStoreState } from '../store'
import type { CelebrationKind } from '../store'

/**
 * The celebration moment for the desk's two completing verbs — Commit and
 * Push. When the git operation actually succeeds (not on click), the button
 * that did it pops with a Commit Green glow ring and sheds a brief burst of
 * confetti tinted only with state colors (green = commit, blue = sync,
 * amber = caution). One authored moment, bound to the verb, never idle
 * decoration: the workbench stays quiet until something is truly done.
 */

const PARTICLE_COLORS = [
  'var(--primary)',
  'var(--primary)',
  'var(--primary)',
  'var(--accent)',
  'var(--caution)'
]

/** Deterministic PRNG so a re-render of the same pulse looks identical. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Particle {
  readonly cx: number
  readonly cy: number
  readonly rotate: number
  readonly delay: number
  readonly width: number
  readonly height: number
  readonly round: boolean
  readonly color: string
}

function buildParticles(seed: number): ReadonlyArray<Particle> {
  const rand = mulberry32(seed * 2654435761)
  const bits: Particle[] = []
  for (let i = 0; i < 14; i++) {
    // Fire into the upper hemisphere, then let each bit fall a little.
    const angle = -Math.PI * (0.08 + rand() * 0.84)
    const distance = 26 + rand() * 36
    bits.push({
      cx: Math.cos(angle) * distance * (1 + rand() * 0.35),
      cy: Math.sin(angle) * distance * (0.6 + rand() * 0.5) + 14 + rand() * 20,
      rotate: rand() * 720 - 360,
      delay: rand() * 90,
      width: 4 + rand() * 3,
      height: rand() < 0.7 ? 3 + rand() * 1.5 : 4 + rand() * 2,
      round: rand() >= 0.7,
      color: PARTICLE_COLORS[Math.floor(rand() * PARTICLE_COLORS.length)]
    })
  }
  return bits
}

/**
 * Reports whether `kind` just succeeded. Remounting never replays an old
 * celebration: the nonce seen at mount is treated as already-consumed.
 */
export function useCelebration(kind: CelebrationKind): {
  readonly nonce: number
  readonly celebrating: boolean
} {
  const celebration = useStoreState().celebration
  const nonce = celebration !== null && celebration.kind === kind ? celebration.nonce : 0
  const lastSeen = useRef(nonce)
  const [celebrating, setCelebrating] = useState(false)

  useEffect(() => {
    if (nonce === 0 || nonce === lastSeen.current) return
    lastSeen.current = nonce
    setCelebrating(true)
    // Longer than the longest particle (680ms + 90ms stagger) so the burst
    // is never cut off mid-flight.
    const timer = setTimeout(() => setCelebrating(false), 900)
    return () => clearTimeout(timer)
  }, [nonce])

  return { nonce, celebrating }
}

/** Absolutely-positioned confetti layer; render inside the celebrating button. */
export function ConfettiBurst({ nonce }: { nonce: number }): JSX.Element {
  const bits = useMemo(() => buildParticles(nonce), [nonce])
  return (
    <span className="confetti-burst" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={
            {
              left: '50%',
              top: '50%',
              width: `${b.width.toFixed(1)}px`,
              height: `${b.height.toFixed(1)}px`,
              background: b.color,
              borderRadius: b.round ? '50%' : '1px',
              '--cx': `${b.cx.toFixed(1)}px`,
              '--cy': `${b.cy.toFixed(1)}px`,
              '--cr': `${b.rotate.toFixed(0)}deg`,
              '--cd': `${b.delay.toFixed(0)}ms`
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
