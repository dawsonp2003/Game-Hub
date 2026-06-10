import type { ComputerOptions } from '../computer-options'

export type GameResult = 'win' | 'loss' | 'draw'

/** Who the player faced. Derived from the game mode. */
export type Opponent = 'computer' | 'user' | 'guest' | 'solo'

export interface GameStats {
  gameId: string
  plays: number
  wins: number
  losses: number
  draws: number
  /** Cloud stats: whole minutes stored in Postgres. */
  totalPlayTimeMin?: number
  /** Milliseconds — local guest stats; cloud rows derive this from minutes for display. */
  totalPlayTimeMs: number
  bestScore: number | null
  /** Cloud rating; only displayed for games in GAMES_WITH_RATING. */
  rating?: number | null
  lastPlayedAt: string | null
}

/** Everything we capture about a single completed play. */
export interface GameEndInput {
  gameId: string
  /** 'solo' | 'ai' | 'pass-and-play' | 'remote' */
  mode: string
  result?: GameResult
  score?: number
  /** Number of moves/turns the player took, if the game tracks it. */
  turns?: number
  durationMs: number
  /** Epoch ms when the round started (defaults to now - duration). */
  startedAt?: number
  /** Computer mode settings (difficulty, etc.) when mode is `ai`. */
  computerOptions?: ComputerOptions
}

export interface StatsStore {
  recordPlay(gameId: string, durationMs: number): void
  recordResult(gameId: string, result: GameResult): void
  recordScore(gameId: string, score: number): void
  getStats(gameId: string): GameStats
  getAllStats(): GameStats[]
}
