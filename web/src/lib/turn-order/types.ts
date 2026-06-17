import type { GameMode } from '../multiplayer/types'

/** Who leads the next session — Player 1 / X / human, or Player 2 / O / computer. */
export type TurnSlot = 'player1' | 'player2'

export type TurnOrderMode = Extract<GameMode, 'ai' | 'pass-and-play'>

export const TURN_ORDER_MODES: TurnOrderMode[] = ['ai', 'pass-and-play']

export function isTurnOrderMode(mode: GameMode): mode is TurnOrderMode {
  return mode === 'ai' || mode === 'pass-and-play'
}

export function initialSetPhase(slot: TurnSlot): 'set-p1' | 'set-p2' {
  return slot === 'player2' ? 'set-p2' : 'set-p1'
}

export function slotFromSetPhase(phase: 'set-p1' | 'set-p2'): TurnSlot {
  return phase === 'set-p2' ? 'player2' : 'player1'
}

export function flipSlot(slot: TurnSlot): TurnSlot {
  return slot === 'player1' ? 'player2' : 'player1'
}
