export type AsyncNotificationsEvent =
  | { type: 'refresh' }
  | { type: 'cleared-turn'; matchId: string }

type Listener = (event: AsyncNotificationsEvent) => void

const listeners = new Set<Listener>()

export function subscribeAsyncNotifications(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitAsyncNotificationsRefresh(): void {
  for (const listener of listeners) {
    listener({ type: 'refresh' })
  }
}

/** Immediately drop the your-turn badge for a match (before server round-trip). */
export function emitAsyncTurnCleared(matchId: string): void {
  for (const listener of listeners) {
    listener({ type: 'cleared-turn', matchId })
  }
}
