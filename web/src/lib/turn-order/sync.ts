import { isPermanentAccount } from '../auth/anonymous'
import { supabase } from '../supabase/client'
import type { TurnOrderMode, TurnSlot } from './types'
import { loadLocalTurnSlot, saveLocalTurnSlot } from './storage'

export async function syncTurnSlotFromCloud(
  userId: string,
  gameId: string,
  mode: TurnOrderMode,
): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session || !isPermanentAccount(data.session.user)) return

  const { data: row, error } = await supabase
    .from('game_turn_prefs')
    .select('next_first')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .eq('mode', mode)
    .maybeSingle()

  if (error || !row) return
  const slot = row.next_first as TurnSlot
  if (slot === 'player1' || slot === 'player2') {
    saveLocalTurnSlot(userId, gameId, mode, slot)
  }
}

export async function flushTurnSlotToCloud(
  userId: string,
  gameId: string,
  mode: TurnOrderMode,
  slot: TurnSlot,
): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session || !isPermanentAccount(data.session.user)) return

  await supabase.from('game_turn_prefs').upsert(
    {
      user_id: userId,
      game_id: gameId,
      mode,
      next_first: slot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,game_id,mode' },
  )
}

export function readTurnSlot(
  userId: string,
  gameId: string,
  mode: TurnOrderMode,
): TurnSlot {
  return loadLocalTurnSlot(userId, gameId, mode)
}

export function writeTurnSlot(
  userId: string,
  gameId: string,
  mode: TurnOrderMode,
  slot: TurnSlot,
): void {
  saveLocalTurnSlot(userId, gameId, mode, slot)
  void flushTurnSlotToCloud(userId, gameId, mode, slot)
}
