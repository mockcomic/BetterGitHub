import { useEffect, useRef, useState } from 'react'

/**
 * Reports the moment a control that could not act just became able to.
 *
 * The desk's verbs are often disabled until the repository makes them true —
 * Commit waits for a checked file, Push waits for something ahead. That flip
 * from “cannot” to “can” is the app pointing at the user's next move, so the
 * button gets one short arm ring (see `.arming` in styles.css). A control
 * that was already enabled when it mounted never pulses: the ring marks a
 * transition the user caused, not first paint.
 */
export function useJustArmed(enabled: boolean, pulseMs = 500): boolean {
  const [armed, setArmed] = useState(false)
  // Seed with the mount-time value so mounting enabled is not a transition.
  const wasEnabled = useRef(enabled)

  useEffect(() => {
    const was = wasEnabled.current
    wasEnabled.current = enabled
    if (was || !enabled) return
    setArmed(true)
    const timer = setTimeout(() => setArmed(false), pulseMs)
    return () => clearTimeout(timer)
  }, [enabled, pulseMs])

  return armed
}
