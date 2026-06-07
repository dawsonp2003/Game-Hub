import { localStatsStore } from './local'
import type { StatsStore } from './types'

/** Local (device) aggregate store — always available, used for guests/offline. */
export const stats: StatsStore = localStatsStore

export { recordGameEnd, fetchCloudStats, fetchPlayCounts } from './record'
export { loadGameProfile } from './game-profile'
export type { GameProfileData } from './game-profile'
export { modeDisplayLabel, formatHistoryLine, sessionsForMode, computeSessionStats, gameModeFromFavorite } from './history'
export type { PlayHistoryEntry, SessionStats } from './history'
export { computeGameStatDisplay, GAME_STAT_METRICS } from './game-stats-display'
export type { StatDisplayItem, StatMetric } from './game-stats-display'
export type { GameStats, StatsStore, GameEndInput, GameResult, Opponent } from './types'
