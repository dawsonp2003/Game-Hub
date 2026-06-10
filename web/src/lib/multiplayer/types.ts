export type GameMode = 'single' | 'ai' | 'pass-and-play' | 'remote' | 'async'

export const MODE_LABELS: Record<GameMode, string> = {
  single: 'Solo',
  ai: 'Computer',
  'pass-and-play': 'Pass & Play',
  remote: 'Online',
  async: 'Async',
}

export const MODE_HINTS: Record<GameMode, string> = {
  single: '',
  ai: '',
  'pass-and-play': '',
  remote: 'Create or join a room from the home page first',
  async: 'Play over days — sign in required',
}

/** Games that support async saved multiplayer. */
export const ASYNC_GAME_IDS = new Set(['tic-tac-toe', 'ultimate-tic-tac-toe'])
