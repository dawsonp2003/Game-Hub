export type GameMode = 'single' | 'ai' | 'pass-and-play' | 'remote'

export const MODE_LABELS: Record<GameMode, string> = {
  single: 'Solo',
  ai: 'vs Computer',
  'pass-and-play': 'Pass & Play',
  remote: 'Remote (room)',
}

export const MODE_HINTS: Record<GameMode, string> = {
  single: '',
  ai: '',
  'pass-and-play': '',
  remote: 'Create or join a room from the home page first',
}
