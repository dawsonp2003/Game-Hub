import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getLocalPlayerId } from '../../lib/auth/local-player'
import type { GameMode } from '../multiplayer/types'
import {
  clearLocalCheckpoint,
  loadLocalCheckpoint,
  saveLocalCheckpoint,
  type GameCheckpoint,
} from './storage'
import { deleteCheckpointFromCloud, queueCheckpointFlush } from './sync'

const DEBOUNCE_MS = 800

export interface UseGameCheckpointOptions<T> {
  gameId: string
  mode: GameMode
  enabled: boolean
  getState: () => T
  /** Return false to skip saving (e.g. game finished). */
  shouldSave?: () => boolean
  matchId?: string
  opponentUserId?: string
}

export function useGameCheckpoint<T>({
  gameId,
  mode,
  enabled,
  getState,
  shouldSave,
  matchId,
  opponentUserId,
}: UseGameCheckpointOptions<T>): {
  clearCheckpoint: () => void
  saveNow: () => void
  debouncedSave: () => void
} {
  const auth = useAuth()
  const localPlayerId = getLocalPlayerId(auth.user?.id)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const getStateRef = useRef(getState)
  const shouldSaveRef = useRef(shouldSave)
  getStateRef.current = getState
  shouldSaveRef.current = shouldSave

  const buildCheckpoint = useCallback((): GameCheckpoint | null => {
    if (!enabled) return null
    if (shouldSaveRef.current && !shouldSaveRef.current()) return null
    return {
      userId: localPlayerId,
      gameId,
      mode,
      state: getStateRef.current(),
      matchId,
      opponentUserId,
      updatedAt: new Date().toISOString(),
      dirty: auth.isPermanent,
    }
  }, [localPlayerId, auth.isPermanent, enabled, gameId, mode, matchId, opponentUserId])

  const saveNow = useCallback(() => {
    const cp = buildCheckpoint()
    if (!cp) return
    saveLocalCheckpoint(cp)
    if (auth.isPermanent) {
      void queueCheckpointFlush(cp)
    }
  }, [auth.isPermanent, buildCheckpoint])

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      saveNow()
    }, DEBOUNCE_MS)
  }, [saveNow])

  const debouncedSave = useCallback(() => {
    if (!enabled) return
    scheduleSave()
  }, [enabled, scheduleSave])

  useEffect(() => {
    if (!enabled) return

    const onHide = () => {
      if (document.visibilityState === 'hidden') saveNow()
    }
    const onPageHide = () => saveNow()

    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [enabled, saveNow])

  const clearCheckpoint = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    clearLocalCheckpoint(localPlayerId, gameId, mode)
    if (auth.isPermanent && auth.user?.id) {
      void deleteCheckpointFromCloud(auth.user.id, gameId, mode)
    }
  }, [auth.isPermanent, auth.user?.id, localPlayerId, gameId, mode])

  return { clearCheckpoint, saveNow, debouncedSave }
}

export function loadCheckpointForMode<T>(
  userId: string,
  gameId: string,
  mode: GameMode,
): T | null {
  const cp = loadLocalCheckpoint(userId, gameId, mode)
  if (!cp) return null
  return cp.state as T
}
