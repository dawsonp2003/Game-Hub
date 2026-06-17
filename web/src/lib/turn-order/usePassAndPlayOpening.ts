import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getNextTurnSlot,
  prefetchTurnOrder,
  rotateTurnSlot,
} from './index'
import { initialSetPhase, type TurnSlot } from './types'

type SetPhase = 'set-p1' | 'set-p2'

/** Alternating who sets / goes first in pass-and-play word games. */
export function usePassAndPlayOpening(gameId: string) {
  const auth = useAuth()
  const startSlotRef = useRef<TurnSlot>(
    getNextTurnSlot(auth.user?.id, gameId, 'pass-and-play'),
  )
  const [openingPhase] = useState<SetPhase>(() => initialSetPhase(startSlotRef.current))

  useEffect(() => {
    prefetchTurnOrder(auth.user?.id, gameId, 'pass-and-play')
  }, [auth.user?.id, gameId])

  const rotateAfterMatch = () => {
    rotateTurnSlot(auth.user?.id, gameId, 'pass-and-play', startSlotRef.current)
  }

  const nextOpeningPhase = (): SetPhase => {
    const slot = getNextTurnSlot(auth.user?.id, gameId, 'pass-and-play')
    startSlotRef.current = slot
    return initialSetPhase(slot)
  }

  return { openingPhase, rotateAfterMatch, nextOpeningPhase }
}
