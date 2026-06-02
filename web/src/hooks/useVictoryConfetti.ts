import { useEffect, useRef } from 'react'
import { fireVictoryConfetti, shouldCelebrateVictory } from '../lib/victory-confetti'

/** Fires screen confetti once when `active` is a winning headline or true. */
export function useVictoryConfetti(active: boolean | string) {
  const firedRef = useRef(false)

  const celebrate =
    typeof active === 'string' ? shouldCelebrateVictory(active) : Boolean(active)

  useEffect(() => {
    if (!celebrate) {
      firedRef.current = false
      return
    }
    if (firedRef.current) return
    firedRef.current = true
    fireVictoryConfetti()
  }, [celebrate])
}
