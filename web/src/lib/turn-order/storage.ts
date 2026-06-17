import type { TurnOrderMode, TurnSlot } from './types'

const STORAGE_PREFIX = 'game-arcade-turn-order:'

function storageKey(userId: string, gameId: string, mode: TurnOrderMode): string {
  return `${STORAGE_PREFIX}${userId}:${gameId}:${mode}`
}

export function loadLocalTurnSlot(
  userId: string,
  gameId: string,
  mode: TurnOrderMode,
): TurnSlot {
  try {
    const raw = localStorage.getItem(storageKey(userId, gameId, mode))
    if (raw === 'player1' || raw === 'player2') return raw
  } catch {
    /* ignore */
  }
  return 'player1'
}

export function saveLocalTurnSlot(
  userId: string,
  gameId: string,
  mode: TurnOrderMode,
  slot: TurnSlot,
): void {
  try {
    localStorage.setItem(storageKey(userId, gameId, mode), slot)
  } catch {
    /* ignore */
  }
}
