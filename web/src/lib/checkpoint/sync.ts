import { supabase } from '../supabase/client'
import type { GameCheckpoint } from './storage'

let pendingFlush: Promise<void> | null = null

/** Push checkpoint to Supabase for permanent accounts (best-effort). */
export async function flushCheckpointToCloud(checkpoint: GameCheckpoint): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user || user.is_anonymous) return

  const { error } = await supabase.from('game_checkpoints').upsert(
    {
      user_id: user.id,
      game_id: checkpoint.gameId,
      mode: checkpoint.mode,
      state: checkpoint.state as Record<string, unknown>,
      match_id: checkpoint.matchId ?? null,
      opponent_user_id: checkpoint.opponentUserId ?? null,
      updated_at: checkpoint.updatedAt,
    },
    { onConflict: 'user_id,game_id,mode' },
  )
  if (error) throw error
}

export async function loadCheckpointFromCloud(
  userId: string,
  gameId: string,
  mode: string,
): Promise<GameCheckpoint | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('game_checkpoints')
    .select('user_id, game_id, mode, state, match_id, opponent_user_id, updated_at')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .eq('mode', mode)
    .maybeSingle()

  if (error || !data) return null

  return {
    userId: data.user_id as string,
    gameId: data.game_id as string,
    mode: data.mode as GameCheckpoint['mode'],
    state: data.state,
    matchId: (data.match_id as string | null) ?? undefined,
    opponentUserId: (data.opponent_user_id as string | null) ?? undefined,
    updatedAt: data.updated_at as string,
  }
}

export async function deleteCheckpointFromCloud(
  userId: string,
  gameId: string,
  mode: string,
): Promise<void> {
  if (!supabase) return
  await supabase
    .from('game_checkpoints')
    .delete()
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .eq('mode', mode)
}

/** Queue a cloud flush; returns a promise that resolves when the flush completes. */
export function queueCheckpointFlush(checkpoint: GameCheckpoint): Promise<void> {
  const run = async () => {
    try {
      await flushCheckpointToCloud(checkpoint)
    } catch (err) {
      console.warn('[checkpoint] cloud flush failed', err)
      throw err
    }
  }
  pendingFlush = (pendingFlush ?? Promise.resolve()).then(run)
  return pendingFlush
}

export function getPendingFlush(): Promise<void> | null {
  return pendingFlush
}

export async function waitForPendingFlush(): Promise<void> {
  if (pendingFlush) await pendingFlush
}
