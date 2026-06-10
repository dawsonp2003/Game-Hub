export type AsyncMatchStatus = 'waiting' | 'active' | 'finished'

export interface AsyncMatchRow {
  id: string
  game_id: string
  join_code: string | null
  player1_id: string
  player2_id: string | null
  status: AsyncMatchStatus
  whose_turn: string | null
  init: Record<string, unknown>
  state: Record<string, unknown>
  winner_id: string | null
  created_at: string
  updated_at: string
  last_move_at: string
}

export interface AsyncMoveRow {
  id: string
  match_id: string
  seq: number
  author_id: string
  payload: unknown
  created_at: string
}

export interface AsyncMatchSummary {
  id: string
  gameId: string
  joinCode: string | null
  status: AsyncMatchStatus
  player1Id: string
  player2Id: string | null
  whoseTurn: string | null
  winnerId: string | null
  lastMoveAt: string
  createdAt: string
  isMyTurn: boolean
}

function mapMatch(row: AsyncMatchRow, myUserId: string): AsyncMatchSummary {
  return {
    id: row.id,
    gameId: row.game_id,
    joinCode: row.join_code,
    status: row.status,
    player1Id: row.player1_id,
    player2Id: row.player2_id,
    whoseTurn: row.whose_turn,
    winnerId: row.winner_id,
    lastMoveAt: row.last_move_at,
    createdAt: row.created_at,
    isMyTurn:
      row.whose_turn === myUserId &&
      (row.status === 'active' ||
        (row.status === 'waiting' && row.player1_id === myUserId)),
  }
}

export function mapMatchRow(row: AsyncMatchRow, myUserId: string): AsyncMatchSummary {
  return mapMatch(row, myUserId)
}
