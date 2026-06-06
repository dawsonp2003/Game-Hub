import { supabase } from '../supabase/client'
import {
  favoriteModeFromHistory,
  formatHistoryLine,
  getLocalPlayHistory,
  type PlayHistoryEntry,
} from './history'

export interface GameProfileData {
  favoriteMode: string | null
  /** All known sessions for this game (used for per-mode stats). */
  sessions: PlayHistoryEntry[]
  recent: PlayHistoryEntry[]
  recentLabels: string[]
}

const MAX_RECENT = 20

async function fetchAllCloudSessions(gameId: string): Promise<PlayHistoryEntry[]> {
  if (!supabase) return []
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return []

  const { data, error } = await supabase
    .from('game_sessions')
    .select('mode, result, score, started_at')
    .eq('game_id', gameId)
    .order('started_at', { ascending: false })

  if (error || !data) {
    if (error) console.warn('[stats] session load failed', error.message)
    return []
  }

  return data.map((row) => ({
    mode: row.mode as string,
    result: (row.result as PlayHistoryEntry['result']) ?? undefined,
    score: (row.score as number | null) ?? undefined,
    playedAt: row.started_at as string,
  }))
}

export async function loadGameProfile(
  gameId: string,
  allowedModes: string[],
): Promise<GameProfileData> {
  const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
  const signedIn = !!sessionData?.session

  const sessions = signedIn ? await fetchAllCloudSessions(gameId) : getLocalPlayHistory(gameId)
  const favoriteMode = favoriteModeFromHistory(sessions, allowedModes)
  const recent = sessions.slice(0, MAX_RECENT)

  return {
    favoriteMode,
    sessions,
    recent,
    recentLabels: recent.map(formatHistoryLine),
  }
}
