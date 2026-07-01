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

/** Live WebRTC room play (party) — includes async titles that also ship remote components. */
export function supportsRoomOnline(modes: GameMode[]): boolean {
  return modes.includes('remote') || modes.includes('async')
}

/** Whether `/play` may use `remote` with the room session. */
export function allowsRemotePlay(modes: GameMode[]): boolean {
  return supportsRoomOnline(modes)
}

/** Default online mode: live room when in a party, async otherwise. */
export function preferredOnlineMode(modes: GameMode[], inParty: boolean): GameMode | null {
  if (inParty && supportsRoomOnline(modes)) return 'remote'
  return defaultOnlineMode(modes)
}

/** Modes shown on the game info page. In a party, Online uses live room play instead of async. */
export function visibleModes(modes: GameMode[], inParty = false): GameMode[] {
  const hasAsync = modes.includes('async')
  if (inParty && hasAsync) {
    const withoutAsync = modes.filter((m) => m !== 'async')
    if (withoutAsync.includes('remote')) return withoutAsync
    return [...withoutAsync, 'remote']
  }
  return modes.filter((m) => m !== 'remote' || !hasAsync)
}

export function defaultOnlineMode(modes: GameMode[]): GameMode | null {
  if (modes.includes('async')) return 'async'
  if (modes.includes('remote')) return 'remote'
  return null
}
