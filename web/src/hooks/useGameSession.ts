import { useCallback, useEffect, useState } from 'react'
import type { GameMode } from '../lib/multiplayer/types'
import type { MultiplayerSession } from '../lib/multiplayer/session'
import { createLocalSession } from '../lib/multiplayer/session'
import { createRemoteSession } from '../lib/multiplayer/remote'

export interface UseGameSessionResult {
  session: MultiplayerSession | null
  loading: boolean
  error: string | null
  status: string
  roomCode: string | null
  connectRemote: (role: 'host' | 'guest', code?: string) => Promise<void>
}

export function useGameSession(mode: GameMode | null): UseGameSessionResult {
  const [session, setSession] = useState<MultiplayerSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [roomCode, setRoomCode] = useState<string | null>(null)

  useEffect(() => {
    if (!mode) return

    if (mode === 'remote') return

    const local = createLocalSession()
    setSession(local)
    return () => local.disconnect()
  }, [mode])

  const connectRemote = useCallback(async (role: 'host' | 'guest', code?: string) => {
    setLoading(true)
    setError(null)
    setStatus('')

    try {
      session?.disconnect()
      const remote = await createRemoteSession({
        role,
        code,
        onCode: setRoomCode,
        onStatus: setStatus,
      })
      setSession(remote)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    return () => session?.disconnect()
  }, [session])

  return { session, loading, error, status, roomCode, connectRemote }
}
