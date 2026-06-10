import { supabase } from '../supabase/client'
import {
  appendAsyncMove,
  fetchAsyncMatch,
  fetchAsyncMoves,
  finishAsyncMatch,
} from '../async/matches'
import { emitAsyncTurnCleared } from '../async/notifications-bus'
import type { AsyncMatchRow } from '../async/types'
import type { ConnectionState, MultiplayerSession, SessionRole } from './session'

const BOARD_GAMES = new Set(['tic-tac-toe', 'ultimate-tic-tac-toe'])

export interface AsyncSessionOptions {
  matchId: string
  userId: string
  onError?: (message: string) => void
}

export class AsyncMatchSession implements MultiplayerSession {
  private _role: SessionRole = 'host'
  connectionState: ConnectionState = 'signaling'
  isConnected = false

  private matchId: string
  private userId: string
  private match: AsyncMatchRow | null = null
  private moveCount = 0
  private handlers = new Set<(message: unknown) => void>()
  private connectionHandlers = new Set<(state: ConnectionState) => void>()
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
  private replayedSeq = new Set<number>()
  private messageHistory: unknown[] = []
  private subscribed = false
  private onError?: (message: string) => void

  get role(): SessionRole {
    return this._role
  }

  constructor(opts: AsyncSessionOptions) {
    this.matchId = opts.matchId
    this.userId = opts.userId
    this.onError = opts.onError
  }

  async initialize(): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    const match = await fetchAsyncMatch(this.matchId)
    if (!match) throw new Error('Match not found')
    this.match = match
    this._role = match.player1_id === this.userId ? 'host' : 'guest'

    const moves = await fetchAsyncMoves(this.matchId)
    this.moveCount = moves.length

    for (const move of moves) {
      this.replayedSeq.add(move.seq)
      this.dispatch(move.payload)
    }

    const canPlay =
      match.status === 'active' ||
      match.status === 'finished' ||
      (match.status === 'waiting' &&
        match.player1_id === this.userId &&
        match.whose_turn === this.userId)
    this.setConnected(canPlay)
    this.subscribeRealtime()
  }

  private subscribeRealtime(): void {
    if (!supabase || this.subscribed) return

    if (this.channel) {
      void supabase.removeChannel(this.channel)
      this.channel = null
    }

    const channelName = `async-match-${this.matchId}-${crypto.randomUUID()}`
    this.channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'async_moves',
          filter: `match_id=eq.${this.matchId}`,
        },
        (payload) => {
          const row = payload.new as { seq: number; payload: unknown; author_id: string }
          if (this.replayedSeq.has(row.seq)) return
          this.replayedSeq.add(row.seq)
          this.moveCount = Math.max(this.moveCount, row.seq)
          if (row.author_id !== this.userId) {
            this.dispatch(row.payload)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'async_matches',
          filter: `id=eq.${this.matchId}`,
        },
        (payload) => {
          const row = payload.new as AsyncMatchRow
          this.match = row
          if (row.status === 'finished') {
            this.setConnected(true)
          }
        },
      )
      .subscribe()

    this.subscribed = true
  }

  private setConnected(connected: boolean): void {
    this.isConnected = connected
    this.connectionState = connected ? 'connected' : 'waiting'
    this.connectionHandlers.forEach((h) => h(this.connectionState))
  }

  private dispatch(message: unknown): void {
    this.messageHistory.push(message)
    this.handlers.forEach((h) => h(message))
  }

  opponentUserId(): string | null {
    if (!this.match) return null
    return this.match.player1_id === this.userId
      ? this.match.player2_id
      : this.match.player1_id
  }

  private formatMoveError(err: unknown): string {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to save move'
    if (msg.includes('waiting for opponent')) {
      return (
        'Could not save your move — the database still requires a friend to join before you can play. ' +
        'Apply the migration `20260611000000_async_creator_first_move.sql` in your Supabase SQL Editor, then try again.'
      )
    }
    return msg || 'Failed to save move'
  }

  /** Persist a board-game move; resolves when saved to Supabase. */
  async sendMove(message: unknown): Promise<void> {
    if (!this.match || this.match.status === 'finished') {
      throw new Error('Match is not active')
    }
    if (!BOARD_GAMES.has(this.match.game_id)) {
      throw new Error('Unsupported game for async moves')
    }

    const opponent = this.opponentUserId()
    const seqExpected = this.moveCount
    const waitingSolo =
      this.match.status === 'waiting' && this.match.player1_id === this.userId && !opponent

    if (!opponent && !waitingSolo) {
      throw new Error('Waiting for opponent to join')
    }

    try {
      const newSeq = await appendAsyncMove(this.matchId, seqExpected, message, {
        nextTurn: opponent ?? null,
      })
      this.moveCount = newSeq
      this.replayedSeq.add(newSeq)
      if (this.match) {
        if (waitingSolo) {
          this.match.whose_turn = null
          this.setConnected(false)
        } else if (opponent) {
          this.match.whose_turn = opponent
        }
      }
      emitAsyncTurnCleared(this.matchId)
    } catch (err) {
      const message = this.formatMoveError(err)
      this.onError?.(message)
      throw new Error(message)
    }
  }

  send(message: unknown): void {
    void this.sendMove(message).catch(() => {
      /* onError already surfaced */
    })
  }

  async markFinished(winnerUserId: string | null): Promise<void> {
    if (!this.match || this.match.status === 'finished') return
    try {
      await finishAsyncMatch(this.matchId, winnerUserId)
      this.match.status = 'finished'
      this.match.winner_id = winnerUserId
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : 'Failed to finish match')
    }
  }

  getMatch(): AsyncMatchRow | null {
    return this.match
  }

  getUserId(): string {
    return this.userId
  }

  /** Map board symbol to auth user id (X = player1/host). */
  winnerUserId(symbol: 'X' | 'O' | 'draw'): string | null {
    if (symbol === 'draw' || !this.match?.player2_id) return null
    if (symbol === 'X') return this.match.player1_id
    return this.match.player2_id
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.handlers.add(handler)
    for (const message of this.messageHistory) {
      handler(message)
    }
    return () => this.handlers.delete(handler)
  }

  onConnectionChange(handler: (state: ConnectionState) => void): () => void {
    this.connectionHandlers.add(handler)
    return () => this.connectionHandlers.delete(handler)
  }

  disconnect(): void {
    if (this.channel && supabase) {
      void supabase.removeChannel(this.channel)
    }
    this.channel = null
    this.subscribed = false
    this.handlers.clear()
    this.connectionHandlers.clear()
    this.messageHistory = []
    this.replayedSeq.clear()
  }
}

export async function createAsyncMatchSession(
  matchId: string,
  onError?: (message: string) => void,
): Promise<AsyncMatchSession> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('Sign in required')

  const session = new AsyncMatchSession({ matchId, userId, onError })
  await session.initialize()
  return session
}
