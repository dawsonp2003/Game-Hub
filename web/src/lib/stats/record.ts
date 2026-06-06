import { supabase } from '../supabase/client'
import { localStatsStore } from './local'
import type { GameEndInput, GameStats, Opponent } from './types'

/** Whole minutes for Supabase storage (rounded from client ms timing). */
function msToMinutes(ms: number): number {
  return Math.max(0, Math.round(ms / 60_000))
}

function opponentForMode(mode: string): Opponent {
  switch (mode) {
    case 'ai':
      return 'computer'
    case 'remote':
      return 'user'
    case 'pass-and-play':
      return 'guest'
    default:
      return 'solo'
  }
}

/** Push a completed play to Supabase (best-effort; never throws to the game). */
async function syncToCloud(input: GameEndInput): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return

  const turns = input.turns && input.turns > 0 ? input.turns : null
  const avgTurnSec = turns ? Math.round(input.durationMs / turns / 1000) : null
  const startedAt = input.startedAt ?? Date.now() - input.durationMs

  await supabase.rpc('record_game_session', {
    p_game_id: input.gameId,
    p_mode: input.mode,
    p_opponent: opponentForMode(input.mode),
    p_result: input.result ?? null,
    p_score: input.score ?? null,
    p_turns: turns,
    p_avg_turn_sec: avgTurnSec,
    p_duration_min: msToMinutes(input.durationMs),
    p_started_at: new Date(startedAt).toISOString(),
  })
}

/**
 * Single entry point games call when a round ends. Always updates the local
 * (device) aggregate so guests and offline play keep working, and additionally
 * records a detailed session to Supabase when the player is signed in.
 */
export function recordGameEnd(input: GameEndInput): void {
  localStatsStore.recordPlay(input.gameId, input.durationMs)
  if (input.result) localStatsStore.recordResult(input.gameId, input.result)
  if (typeof input.score === 'number') localStatsStore.recordScore(input.gameId, input.score)

  void syncToCloud(input).catch((err) => {
    console.warn('[stats] cloud sync failed', err)
  })
}

/** Per-game cloud stats for the signed-in user (empty when not signed in). */
export async function fetchCloudStats(): Promise<GameStats[]> {
  if (!supabase) return []
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return []

  const { data, error } = await supabase
    .from('game_stats')
    .select(
      'game_id, plays, wins, losses, draws, total_play_time_min, best_score, rating, last_played_at',
    )
    .order('last_played_at', { ascending: false })

  if (error || !data) return []

  return data.map((row) => ({
    gameId: row.game_id as string,
    plays: row.plays as number,
    wins: row.wins as number,
    losses: row.losses as number,
    draws: row.draws as number,
    totalPlayTimeMin: row.total_play_time_min as number,
    totalPlayTimeMs: (row.total_play_time_min as number) * 60_000,
    bestScore: (row.best_score as number | null) ?? null,
    rating: (row.rating as number | null) ?? null,
    lastPlayedAt: (row.last_played_at as string | null) ?? null,
  }))
}
