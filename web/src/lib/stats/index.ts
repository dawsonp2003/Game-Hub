import { localStatsStore } from './local'
import type { StatsStore } from './types'

/** Local (device) aggregate store — always available, used for guests/offline. */
export const stats: StatsStore = localStatsStore

export {
  recordGameEnd,
  fetchCloudStats,
  fetchPlayCounts,
  getCachedPlayCounts,
  invalidatePlayCountsCache,
} from './record'
export { loadGameProfile } from './game-profile'
export type { GameProfileData } from './game-profile'
export { modeDisplayLabel, formatHistoryLine, formatHistoryRow, sessionsForMode, computeSessionStats, gameModeFromFavorite } from './history'
export type { PlayHistoryEntry, SessionStats, HistoryTableRow } from './history'
export {
  computeGameStatDisplay,
  formatAccountGameSummary,
  gameShowsRating,
  GAME_STAT_METRICS,
  GAMES_WITH_RATING,
} from './game-stats-display'
export type { StatDisplayItem, StatMetric } from './game-stats-display'
export type { GameStats, StatsStore, GameEndInput, GameResult, Opponent } from './types'
