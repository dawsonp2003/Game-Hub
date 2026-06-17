import type { GameMode } from '../multiplayer/types'

export interface GameCheckpoint {
  userId: string
  gameId: string
  mode: GameMode
  state: unknown
  matchId?: string
  opponentUserId?: string
  updatedAt: string
  /** True when a cloud flush is still pending. */
  dirty?: boolean
}

const STORAGE_PREFIX = 'game-arcade-checkpoint:'

function storageKey(userId: string, gameId: string, mode: GameMode): string {
  return `${STORAGE_PREFIX}${userId}:${gameId}:${mode}`
}

export function loadLocalCheckpoint(
  userId: string,
  gameId: string,
  mode: GameMode,
): GameCheckpoint | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, gameId, mode))
    if (!raw) return null
    return JSON.parse(raw) as GameCheckpoint
  } catch {
    return null
  }
}

export function saveLocalCheckpoint(checkpoint: GameCheckpoint): void {
  try {
    localStorage.setItem(
      storageKey(checkpoint.userId, checkpoint.gameId, checkpoint.mode),
      JSON.stringify({ ...checkpoint, updatedAt: new Date().toISOString() }),
    )
  } catch (err) {
    console.warn('[checkpoint] local save failed', err)
  }
}

export function clearLocalCheckpoint(userId: string, gameId: string, mode: GameMode): void {
  try {
    localStorage.removeItem(storageKey(userId, gameId, mode))
  } catch {
    /* ignore */
  }
}

export function hasLocalCheckpoint(userId: string, gameId: string, mode: GameMode): boolean {
  return loadLocalCheckpoint(userId, gameId, mode) !== null
}

/** Async match cache keyed by match id (supplementary to DB replay). */
const ASYNC_CACHE_PREFIX = 'game-arcade-async-cache:'

export function saveAsyncMatchCache(matchId: string, state: unknown): void {
  try {
    localStorage.setItem(
      `${ASYNC_CACHE_PREFIX}${matchId}`,
      JSON.stringify({ state, updatedAt: new Date().toISOString() }),
    )
  } catch {
    /* ignore */
  }
}

export function loadAsyncMatchCache(matchId: string): unknown | null {
  try {
    const raw = localStorage.getItem(`${ASYNC_CACHE_PREFIX}${matchId}`)
    if (!raw) return null
    return (JSON.parse(raw) as { state: unknown }).state
  } catch {
    return null
  }
}

export function clearAsyncMatchCache(matchId: string): void {
  try {
    localStorage.removeItem(`${ASYNC_CACHE_PREFIX}${matchId}`)
  } catch {
    /* ignore */
  }
}
