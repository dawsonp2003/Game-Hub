import type { TurnOrderMode, TurnSlot } from './types'
import { flipSlot } from './types'
import { readTurnSlot, syncTurnSlotFromCloud, writeTurnSlot } from './sync'

export type { TurnOrderMode, TurnSlot } from './types'
export { firstPlayerFromAsyncMatch } from './async-opening'
export {
  getRemoteOpening,
  nextRemoteOpening,
  rotateRemoteOpening,
} from './remote-opening'
export {
  flipSlot,
  initialSetPhase,
  isTurnOrderMode,
  slotFromSetPhase,
  TURN_ORDER_MODES,
} from './types'

/** Board games: player1 → X, player2 → O. */
export function xFromSlot(slot: TurnSlot): 'X' | 'O' {
  return slot === 'player2' ? 'O' : 'X'
}

export function slotFromX(symbol: 'X' | 'O'): TurnSlot {
  return symbol === 'O' ? 'player2' : 'player1'
}

export function turnUserId(userId: string | undefined): string {
  return userId ?? '__local__'
}

/** Who should go first in the next game for this user + game + mode. */
export function getNextTurnSlot(
  userId: string | undefined,
  gameId: string,
  mode: TurnOrderMode,
): TurnSlot {
  return readTurnSlot(turnUserId(userId), gameId, mode)
}

/** After a game finishes, store who should lead the next one. */
export function rotateTurnSlot(
  userId: string | undefined,
  gameId: string,
  mode: TurnOrderMode,
  whoWentFirst: TurnSlot,
): void {
  const uid = turnUserId(userId)
  writeTurnSlot(uid, gameId, mode, flipSlot(whoWentFirst))
}

/** Pull cloud preference into localStorage (permanent accounts). */
export function prefetchTurnOrder(
  userId: string | undefined,
  gameId: string,
  mode: TurnOrderMode,
): void {
  if (!userId) return
  void syncTurnSlotFromCloud(turnUserId(userId), gameId, mode)
}
