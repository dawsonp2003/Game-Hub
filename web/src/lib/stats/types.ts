export interface GameStats {
  gameId: string
  plays: number
  wins: number
  losses: number
  draws: number
  totalPlayTimeMs: number
  bestScore: number | null
  lastPlayedAt: string | null
}

export interface StatsStore {
  recordPlay(gameId: string, durationMs: number): void
  recordResult(gameId: string, result: 'win' | 'loss' | 'draw'): void
  recordScore(gameId: string, score: number): void
  getStats(gameId: string): GameStats
  getAllStats(): GameStats[]
}
