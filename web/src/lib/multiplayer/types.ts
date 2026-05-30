export type GameMode = 'single' | 'ai' | 'pass-and-play' | 'remote'

export const MODE_LABELS: Record<GameMode, string> = {
  single: 'Solo',
  ai: 'vs Computer',
  'pass-and-play': 'Pass & Play',
  remote: 'Remote (6-digit code)',
}
