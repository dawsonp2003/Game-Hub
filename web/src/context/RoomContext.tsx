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
  createRoom: () => Promise<void>
  joinRoom: (code: string) => Promise<void>
  leaveRoom: () => void
  closeRoom: () => void
}

const RoomContext = createContext<RoomContextValue | null>(null)

export function RoomProvider({ children }: { children: ReactNode }) {
  const connectionRef = useRef<RoomConnection | null>(null)
  const [status, setStatus] = useState<ConnectionState>('disconnected')
  const [role, setRole] = useState<SessionRole | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [peerAwayUntil, setPeerAwayUntil] = useState<number | null>(null)
  const [session, setSession] = useState<MultiplayerSession | null>(null)

  const getConnection = useCallback(() => {
    if (!connectionRef.current) {
      connectionRef.current = new RoomConnection()
    }
    return connectionRef.current
  }, [])

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
          setStatus('disconnected')
          setStatusMessage('')
          setError(
            event.reason === 'host-closed'
              ? 'Host closed the room'
              : 'Room closed',
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

    return () => {
      unsub()
    }
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
      createRoom,
      joinRoom,
      leaveRoom,
      closeRoom,
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
      createRoom,
      joinRoom,
      leaveRoom,
      closeRoom,
    ],
  )

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error('useRoom must be used within RoomProvider')
  return ctx
}
