import { resolveRecordedComputerOptions } from '../computer-options'
import { supabase } from '../supabase/client'
import { appendLocalPlayHistory } from './history'
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
    p_computer_options:
      input.mode === 'ai' && input.computerOptions && Object.keys(input.computerOptions).length > 0
        ? input.computerOptions
        : null,
    p_opponent_user_id: input.opponentUserId ?? null,
  })
}

/**
 * Single entry point games call when a round ends. Always updates the local
 * (device) aggregate so guests and offline play keep working, and additionally
 * records a detailed session to Supabase when the player is signed in.
 */
export function recordGameEnd(input: GameEndInput): void {
  const computerOptions = resolveRecordedComputerOptions(
    input.gameId,
    input.mode,
    input.computerOptions,
  )
  const record = { ...input, computerOptions }

  localStatsStore.recordPlay(record.gameId, record.durationMs)
  if (record.result) localStatsStore.recordResult(record.gameId, record.result)
  if (typeof record.score === 'number') localStatsStore.recordScore(record.gameId, record.score)
  appendLocalPlayHistory(record)
  invalidatePlayCountsCache()

  void syncToCloud(record).catch((err) => {
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

  if (error) {
    console.warn('[stats] cloud stats load failed', error.message)
    return []
  }
  if (!data) return []

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

function playCountsFromLocal(): Record<string, number> {
  return Object.fromEntries(localStatsStore.getAllStats().map((r) => [r.gameId, r.plays]))
}

let playCountsCache: { userKey: string; counts: Record<string, number> } | null = null

function playCountsUserKey(userId: string | undefined): string {
  return userId ?? '__guest__'
}

/** Synchronous read of the last fetched play-count snapshot for this user. */
export function getCachedPlayCounts(userId: string | undefined): Record<string, number> | null {
  const key = playCountsUserKey(userId)
  if (playCountsCache?.userKey === key) return playCountsCache.counts
  return null
}

export function invalidatePlayCountsCache(): void {
  playCountsCache = null
}

/** Per-game play counts for sorting (cloud when signed in, local otherwise). */
export async function fetchPlayCounts(userId?: string): Promise<Record<string, number>> {
  let counts: Record<string, number>

  if (!supabase) {
    counts = playCountsFromLocal()
  } else {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      counts = playCountsFromLocal()
    } else {
      const rows = await fetchCloudStats()
      counts = Object.fromEntries(rows.map((r) => [r.gameId, r.plays]))
    }
  }

  playCountsCache = { userKey: playCountsUserKey(userId ?? undefined), counts }
  return counts
}
