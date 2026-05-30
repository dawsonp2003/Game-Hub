import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { getGameById } from '../games/registry'
import type { GameLaunch, GameSuggestion } from '../lib/multiplayer/room-messages'
import { isRoomChannelMessage } from '../lib/multiplayer/room-messages'
import type { ConnectionState, MultiplayerSession, SessionRole } from '../lib/multiplayer/session'
import { RoomConnection } from '../lib/multiplayer/room'

export interface RoomContextValue {
  status: ConnectionState
  role: SessionRole | null
  roomCode: string | null
  statusMessage: string
  error: string | null
  loading: boolean
  peerAwayUntil: number | null
  session: MultiplayerSession | null
  isInRoom: boolean
  isPlayReady: boolean
  suggestion: GameSuggestion | null
  pendingLaunch: GameLaunch | null
  lastSuggested: GameSuggestion | null
  createRoom: () => Promise<void>
  joinRoom: (code: string) => Promise<void>
  leaveRoom: () => void
  closeRoom: () => void
  launchGame: (gameId: string) => void
  suggestGame: (gameId: string) => void
  acceptSuggestion: () => void
  dismissSuggestion: () => void
  clearPendingLaunch: () => void
}

const RoomContext = createContext<RoomContextValue | null>(null)

function RoomNavigator() {
  const { pendingLaunch, clearPendingLaunch } = useRoom()
  const navigate = useNavigate()

  useEffect(() => {
    if (!pendingLaunch) return
    navigate(`/play/${pendingLaunch.gameId}`, { state: { roomLaunch: true } })
    clearPendingLaunch()
  }, [pendingLaunch, navigate, clearPendingLaunch])

  return null
}

export function RoomProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const connectionRef = useRef<RoomConnection | null>(null)
  const roleRef = useRef<SessionRole | null>(null)
  const [status, setStatus] = useState<ConnectionState>('disconnected')
  const [role, setRole] = useState<SessionRole | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [peerAwayUntil, setPeerAwayUntil] = useState<number | null>(null)
  const [session, setSession] = useState<MultiplayerSession | null>(null)
  const [suggestion, setSuggestion] = useState<GameSuggestion | null>(null)
  const [pendingLaunch, setPendingLaunch] = useState<GameLaunch | null>(null)
  const [lastSuggested, setLastSuggested] = useState<GameSuggestion | null>(null)

  roleRef.current = role

  const getConnection = useCallback(() => {
    if (!connectionRef.current) {
      connectionRef.current = new RoomConnection()
    }
    return connectionRef.current
  }, [])

  useEffect(() => {
    if (!session) return
    return session.onMessage((msg) => {
      if (!isRoomChannelMessage(msg)) return

      if (msg.type === 'room:suggest' && roleRef.current === 'host') {
        setSuggestion({ gameId: msg.gameId, gameName: msg.gameName })
      }
      if (msg.type === 'room:dismiss-suggestion') {
        setSuggestion(null)
      }
      if (msg.type === 'room:launch') {
        setPendingLaunch({ gameId: msg.gameId, gameName: msg.gameName })
      }
    })
  }, [session])

  useEffect(() => {
    const conn = getConnection()
    setSession(conn.session)

    const unsub = conn.onEvent((event) => {
      switch (event.type) {
        case 'state':
          setStatus(event.state)
          setStatusMessage(event.message)
          if (event.state === 'connected') setPeerAwayUntil(null)
          break
        case 'room-code':
          setRoomCode(event.code)
          setRole(event.role)
          setError(null)
          break
        case 'peer-away':
          setPeerAwayUntil(event.until)
          break
        case 'peer-back':
          setPeerAwayUntil(null)
          break
        case 'room-closed':
          setRoomCode(null)
          setRole(null)
          setPeerAwayUntil(null)
          setSuggestion(null)
          setPendingLaunch(null)
          setLastSuggested(null)
          setStatus('disconnected')
          setStatusMessage('')
          setError(
            event.reason === 'host-closed' ? 'Host closed the room' : 'Room closed',
          )
          connectionRef.current = null
          setSession(null)
          break
        case 'error':
          setError(event.message)
          break
      }
    })

    setLoading(true)
    conn.tryRestoreRoom().finally(() => setLoading(false))

    return () => unsub()
  }, [getConnection])

  const createRoom = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      connectionRef.current?.destroy()
      const conn = getConnection()
      setSession(conn.session)
      await conn.createRoom()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room')
    } finally {
      setLoading(false)
    }
  }, [getConnection])

  const joinRoom = useCallback(
    async (code: string) => {
      setLoading(true)
      setError(null)
      try {
        connectionRef.current?.destroy()
        const conn = getConnection()
        setSession(conn.session)
        await conn.joinRoom(code)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to join room')
      } finally {
        setLoading(false)
      }
    },
    [getConnection],
  )

  const leaveRoom = useCallback(() => {
    connectionRef.current?.leaveRoom()
    connectionRef.current = null
    setSession(null)
    setRoomCode(null)
    setRole(null)
    setStatus('disconnected')
    setStatusMessage('')
    setPeerAwayUntil(null)
    setSuggestion(null)
    setPendingLaunch(null)
    setLastSuggested(null)
    setError(null)
  }, [])

  const closeRoom = useCallback(() => {
    connectionRef.current?.closeRoom()
    connectionRef.current = null
    setSession(null)
    setRoomCode(null)
    setRole(null)
    setStatus('disconnected')
    setStatusMessage('')
    setPeerAwayUntil(null)
    setSuggestion(null)
    setPendingLaunch(null)
    setLastSuggested(null)
  }, [])

  const launchGame = useCallback(
    (gameId: string) => {
      const game = getGameById(gameId)
      if (!game || roleRef.current !== 'host') return

      session?.send({
        type: 'room:launch',
        gameId,
        gameName: game.name,
      })
      setSuggestion(null)
      navigate(`/play/${gameId}`, { state: { roomLaunch: true } })
    },
    [session, navigate],
  )

  const suggestGame = useCallback(
    (gameId: string) => {
      const game = getGameById(gameId)
      if (!game || roleRef.current !== 'guest') return

      const payload = { type: 'room:suggest' as const, gameId, gameName: game.name }
      session?.send(payload)
      setLastSuggested({ gameId, gameName: game.name })
    },
    [session],
  )

  const acceptSuggestion = useCallback(() => {
    if (!suggestion || roleRef.current !== 'host') return
    launchGame(suggestion.gameId)
  }, [suggestion, launchGame])

  const dismissSuggestion = useCallback(() => {
    setSuggestion(null)
    session?.send({ type: 'room:dismiss-suggestion' })
  }, [session])

  const clearPendingLaunch = useCallback(() => {
    setPendingLaunch(null)
  }, [])

  const value = useMemo<RoomContextValue>(
    () => ({
      status,
      role,
      roomCode,
      statusMessage,
      error,
      loading,
      peerAwayUntil,
      session,
      isInRoom: status !== 'disconnected',
      isPlayReady: status === 'connected',
      suggestion,
      pendingLaunch,
      lastSuggested,
      createRoom,
      joinRoom,
      leaveRoom,
      closeRoom,
      launchGame,
      suggestGame,
      acceptSuggestion,
      dismissSuggestion,
      clearPendingLaunch,
    }),
    [
      status,
      role,
      roomCode,
      statusMessage,
      error,
      loading,
      peerAwayUntil,
      session,
      suggestion,
      pendingLaunch,
      lastSuggested,
      createRoom,
      joinRoom,
      leaveRoom,
      closeRoom,
      launchGame,
      suggestGame,
      acceptSuggestion,
      dismissSuggestion,
      clearPendingLaunch,
    ],
  )

  return (
    <RoomContext.Provider value={value}>
      <RoomNavigator />
      {children}
    </RoomContext.Provider>
  )
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error('useRoom must be used within RoomProvider')
  return ctx
}
