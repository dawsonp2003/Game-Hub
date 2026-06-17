export type GameMode = 'single' | 'ai' | 'pass-and-play' | 'remote' | 'async'

export const MODE_LABELS: Record<GameMode, string> = {
  single: 'Solo',
  ai: 'Computer',
  'pass-and-play': 'Pass & Play',
  remote: 'Online',
  async: 'Online',
}

export const MODE_HINTS: Record<GameMode, string> = {
  single: '',
  ai: '',
  'pass-and-play': '',
  remote: 'Play with a friend — every move is saved',
  async: 'Play with a friend — every move is saved',
}

/** Games that support async saved multiplayer (DB-backed online play). */
export const ASYNC_GAME_IDS = new Set([
  'tic-tac-toe',
  'ultimate-tic-tac-toe',
  'word-guess',
  'hangman',
  'word-ladder',
  'word-chain',
])

/** Modes shown on the game info page (remote is legacy — use async). */
export function visibleModes(modes: GameMode[]): GameMode[] {
  const hasAsync = modes.includes('async')
  return modes.filter((m) => m !== 'remote' || !hasAsync)
}

export function defaultOnlineMode(modes: GameMode[]): GameMode | null {
  if (modes.includes('async')) return 'async'
  if (modes.includes('remote')) return 'remote'
  return null
}
