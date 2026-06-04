import { localStatsStore } from './local'
import type { StatsStore } from './types'

/** Local (device) aggregate store — always available, used for guests/offline. */
export const stats: StatsStore = localStatsStore

export { recordGameEnd, fetchCloudStats } from './record'
export type { GameStats, StatsStore, GameEndInput, GameResult, Opponent } from './types'
