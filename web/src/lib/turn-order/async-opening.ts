import type { AsyncMatchRow } from '../async/types'

/** Host = X, guest = O; first turn user id comes from match init (set on join). */
export function firstPlayerFromAsyncMatch(match: AsyncMatchRow): 'X' | 'O' {
  const raw = match.init?.first_turn_user_id
  const firstUserId = typeof raw === 'string' ? raw : null
  if (firstUserId && match.player2_id) {
    return firstUserId === match.player2_id ? 'O' : 'X'
  }
  if (match.player2_id && match.whose_turn === match.player2_id) {
    return 'O'
  }
  return 'X'
}
