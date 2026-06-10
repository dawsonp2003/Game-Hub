import { supabase } from '../supabase/client'
import { emitAsyncNotificationsRefresh } from './notifications-bus'
import type { AsyncMatchRow, AsyncMatchSummary, AsyncMoveRow } from './types'
import { mapMatchRow } from './types'

const MATCH_COLUMNS =
  'id, game_id, join_code, player1_id, player2_id, status, whose_turn, init, state, winner_id, created_at, updated_at, last_move_at'

async function requireUserId(): Promise<string> {
  if (!supabase) throw new Error('Accounts are not configured.')
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Sign in to use async games.')
  return data.session.user.id
}

export async function pruneMyStaleMatches(): Promise<number> {
  if (!supabase) return 0
  const { data } = await supabase.auth.getSession()
  if (!data.session) return 0
  const { data: count, error } = await supabase.rpc('prune_my_stale_matches')
  if (error) {
    console.warn('[async] prune failed', error.message)
    return 0
  }
  return (count as number) ?? 0
}

export async function listAllMyAsyncMatches(): Promise<AsyncMatchSummary[]> {
  const uid = await requireUserId()
  const { data, error } = await supabase!
    .from('async_matches')
    .select(MATCH_COLUMNS)
    .in('status', ['waiting', 'active'])
    .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
    .order('last_move_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as AsyncMatchRow[]).map((r) => mapMatchRow(r, uid))
}

export async function listMyAsyncMatches(gameId: string): Promise<AsyncMatchSummary[]> {
  const uid = await requireUserId()
  const { data, error } = await supabase!
    .from('async_matches')
    .select(MATCH_COLUMNS)
    .eq('game_id', gameId)
    .in('status', ['waiting', 'active'])
    .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
    .order('last_move_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as AsyncMatchRow[]).map((r) => mapMatchRow(r, uid))
}

export async function countMyActiveMatches(gameId: string): Promise<number> {
  const matches = await listMyAsyncMatches(gameId)
  return matches.length
}

export async function createAsyncMatch(
  gameId: string,
  init: Record<string, unknown> = {},
): Promise<{ matchId: string; joinCode: string }> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('create_async_match', {
    p_game_id: gameId,
    p_init: init,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  emitAsyncNotificationsRefresh()
  return {
    matchId: row.match_id as string,
    joinCode: row.join_code as string,
  }
}

export async function joinAsyncMatch(joinCode: string): Promise<string> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('join_async_match', {
    p_join_code: joinCode.replace(/\D/g, '').slice(0, 6),
  })
  if (error) throw error
  emitAsyncNotificationsRefresh()
  return data as string
}

export async function deleteAsyncMatch(matchId: string): Promise<void> {
  await requireUserId()
  const { error } = await supabase!.rpc('delete_async_match', { p_match_id: matchId })
  if (error) throw error
  emitAsyncNotificationsRefresh()
}

export async function fetchAsyncMatch(matchId: string): Promise<AsyncMatchRow | null> {
  const uid = await requireUserId()
  const { data, error } = await supabase!
    .from('async_matches')
    .select(MATCH_COLUMNS)
    .eq('id', matchId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as AsyncMatchRow
  if (row.player1_id !== uid && row.player2_id !== uid) return null
  return row
}

export async function fetchAsyncMoves(matchId: string): Promise<AsyncMoveRow[]> {
  await requireUserId()
  const { data, error } = await supabase!
    .from('async_moves')
    .select('id, match_id, seq, author_id, payload, created_at')
    .eq('match_id', matchId)
    .order('seq', { ascending: true })
  if (error) throw error
  return (data ?? []) as AsyncMoveRow[]
}

export async function appendAsyncMove(
  matchId: string,
  seqExpected: number,
  payload: unknown,
  opts: {
    nextTurn?: string | null
    newState?: Record<string, unknown>
    finished?: boolean
    winnerId?: string | null
  } = {},
): Promise<number> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('append_async_move', {
    p_match_id: matchId,
    p_seq_expected: seqExpected,
    p_payload: payload,
    p_next_turn: opts.nextTurn ?? null,
    p_new_state: opts.newState ?? null,
    p_finished: opts.finished ?? false,
    p_winner_id: opts.winnerId ?? null,
  })
  if (error) throw error
  emitAsyncNotificationsRefresh()
  return data as number
}

export async function finishAsyncMatch(
  matchId: string,
  winnerId: string | null,
): Promise<void> {
  await requireUserId()
  const { error } = await supabase!.rpc('finish_async_match', {
    p_match_id: matchId,
    p_winner_id: winnerId,
  })
  if (error) throw error
  emitAsyncNotificationsRefresh()
}

export async function countMyTurnMatches(): Promise<number> {
  if (!supabase) return 0
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return 0
  try {
    const matches = await listAllMyAsyncMatches()
    return matches.filter((m) => m.isMyTurn).length
  } catch {
    return 0
  }
}

export function buildAsyncJoinUrl(joinCode: string): string {
  const code = joinCode.replace(/\D/g, '').slice(0, 6)
  const url = new URL(window.location.href)
  url.searchParams.set('async', code)
  return url.toString()
}

export function parseAsyncCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('async')
  if (!code) return null
  const normalized = code.replace(/\D/g, '').slice(0, 6)
  return normalized.length === 6 ? normalized : null
}

export function clearAsyncCodeFromUrl(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('async')) return
  url.searchParams.delete('async')
  window.history.replaceState(window.history.state, '', url.toString())
}

/** Join by code; returns match + game ids. Handles joining your own waiting game. */
export async function joinAsyncMatchFromCode(
  joinCode: string,
): Promise<{ matchId: string; gameId: string }> {
  const code = joinCode.replace(/\D/g, '').slice(0, 6)
  const uid = await requireUserId()

  try {
    const matchId = await joinAsyncMatch(code)
    const match = await fetchAsyncMatch(matchId)
    if (!match) throw new Error('Match not found after join')
    return { matchId, gameId: match.game_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (!message.includes('cannot join your own game')) throw err

    const { data, error } = await supabase!
      .from('async_matches')
      .select(MATCH_COLUMNS)
      .eq('join_code', code)
      .eq('status', 'waiting')
      .eq('player1_id', uid)
      .maybeSingle()

    if (error) throw error
    if (!data) throw err
    const row = data as AsyncMatchRow
    return { matchId: row.id, gameId: row.game_id }
  }
}
