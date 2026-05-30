import { localStatsStore } from './local'
import type { StatsStore } from './types'

/** Swap implementation for Supabase in a later phase. */
export const stats: StatsStore = localStatsStore

export type { GameStats, StatsStore } from './types'
