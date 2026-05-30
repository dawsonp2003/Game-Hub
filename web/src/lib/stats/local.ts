import type { GameStats, StatsStore } from './types'

const STORAGE_KEY = 'game-arcade-stats'

function emptyStats(gameId: string): GameStats {
  return {
    gameId,
    plays: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    totalPlayTimeMs: 0,
    bestScore: null,
    lastPlayedAt: null,
  }
}

function loadAll(): Record<string, GameStats> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, GameStats>
  } catch {
    return {}
  }
}

function saveAll(data: Record<string, GameStats>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function ensure(data: Record<string, GameStats>, gameId: string): GameStats {
  if (!data[gameId]) data[gameId] = emptyStats(gameId)
  return data[gameId]
}

export const localStatsStore: StatsStore = {
  recordPlay(gameId, durationMs) {
    const data = loadAll()
    const s = ensure(data, gameId)
    s.plays += 1
    s.totalPlayTimeMs += durationMs
    s.lastPlayedAt = new Date().toISOString()
    saveAll(data)
  },

  recordResult(gameId, result) {
    const data = loadAll()
    const s = ensure(data, gameId)
    if (result === 'win') s.wins += 1
    else if (result === 'loss') s.losses += 1
    else s.draws += 1
    s.lastPlayedAt = new Date().toISOString()
    saveAll(data)
  },

  recordScore(gameId, score) {
    const data = loadAll()
    const s = ensure(data, gameId)
    if (s.bestScore === null || score > s.bestScore) {
      s.bestScore = score
    }
    s.lastPlayedAt = new Date().toISOString()
    saveAll(data)
  },

  getStats(gameId) {
    const data = loadAll()
    return data[gameId] ?? emptyStats(gameId)
  },

  getAllStats() {
    return Object.values(loadAll())
  },
}
