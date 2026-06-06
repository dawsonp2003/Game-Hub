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
import { RoomConnection, clearRoomPrefs, loadRoomPrefs, type RoomEvent } from '../lib/multiplayer/room'
import { parseRoomCodeFromUrl, setRoomUrlParam } from '../lib/multiplayer/room-link'

export type RoomPendingAction = 'create' | 'join' | 'restore' | null

export interface RoomContextValue {
  status: ConnectionState
  role: SessionRole | null
  roomCode: string | null
  statusMessage: string
  error: string | null
  loading: boolean
  pendingAction: RoomPendingAction
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
  /** True when the app should show the room panel (e.g. invite link). */
  roomPanelOpen: boolean
  setRoomPanelOpen: (open: boolean) => void
}

const RoomContext = createContext<RoomContextValue | null>(null)

function RoomNavigator() {
  const { pendingLaunch, clearPendingLaunch } = useRoom()
  const navigate = useNavigate()

  useEffect(() => {
    if (!pendingLaunch) return
    navigate(`/play/${pendingLaunch.gameId}`, { state: { roomLaunch: true, mode: 'remote' } })
    clearPendingLaunch()
  }, [pendingLaunch, navigate, clearPendingLaunch])

  return null
}

export function RoomProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const connectionRef = useRef<RoomConnection | null>(null)
  const eventUnsubRef = useRef<(() => void) | null>(null)
  const roleRef = useRef<SessionRole | null>(null)
  const didBootstrapRef = useRef(false)
  const [status, setStatus] = useState<ConnectionState>('disconnected')
  const [role, setRole] = useState<SessionRole | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => !!parseRoomCodeFromUrl())
  const [pendingAction, setPendingAction] = useState<RoomPendingAction>(() =>
    parseRoomCodeFromUrl() ? 'join' : null,
  )
  const [peerAwayUntil, setPeerAwayUntil] = useState<number | null>(null)
  const [session, setSession] = useState<MultiplayerSession | null>(null)
  const [suggestion, setSuggestion] = useState<GameSuggestion | null>(null)
  const [pendingLaunch, setPendingLaunch] = useState<GameLaunch | null>(null)
  const [lastSuggested, setLastSuggested] = useState<GameSuggestion | null>(null)
  const [roomPanelOpen, setRoomPanelOpen] = useState(() => !!parseRoomCodeFromUrl())

  roleRef.current = role

  const handleRoomEvent = useCallback((event: RoomEvent) => {
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
        setLoading(false)
        setPendingAction(null)
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
        setError(event.reason === 'host-closed' ? 'Host closed the room' : 'Room closed')
        connectionRef.current = null
        setSession(null)
        break
      case 'error':
        setError(event.message)
        setLoading(false)
        setPendingAction(null)
        break
    }
  }, [])

  const attachConnection = useCallback(
    (conn: RoomConnection) => {
      eventUnsubRef.current?.()
      connectionRef.current = conn
      setSession(conn.session)
      eventUnsubRef.current = conn.onEvent(handleRoomEvent)
    },
    [handleRoomEvent],
  )

  const replaceConnection = useCallback(() => {
    connectionRef.current?.teardown()
    const conn = new RoomConnection()
    attachConnection(conn)
    return conn
  }, [attachConnection])

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

  // Run once on app load. Guarded by a ref (not torn down on StrictMode's
  // throwaway cleanup) so the single connection isn't killed mid-handshake.
  useEffect(() => {
    if (didBootstrapRef.current) return
    didBootstrapRef.current = true

    const conn = replaceConnection()
    const inviteCode = parseRoomCodeFromUrl()

    async function bootstrap() {
      if (inviteCode) {
        setRoomPanelOpen(true)
        setPendingAction('join')
        setLoading(true)
        setError(null)
        setStatusMessage(`Joining room ${inviteCode}…`)

        const prefs = loadRoomPrefs()
        if (prefs?.code !== inviteCode) clearRoomPrefs()

        try {
          await conn.joinRoom(inviteCode)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not join room')
          setStatusMessage('')
        } finally {
          setLoading(false)
          setPendingAction(null)
        }
        return
      }

      setPendingAction('restore')
      setLoading(true)
      setError(null)
      try {
        await conn.tryRestoreRoom()
      } catch {
        clearRoomPrefs()
      } finally {
        setLoading(false)
        setPendingAction(null)
      }
    }

    void bootstrap()
  }, [replaceConnection])

  useEffect(() => {
    if (roomCode) setRoomUrlParam(roomCode)
    else setRoomUrlParam(null)
  }, [roomCode])

  const createRoom = useCallback(async () => {
    setPendingAction('create')
    setLoading(true)
    setError(null)
    setStatusMessage('Connecting to server…')
    try {
      const conn = replaceConnection()
      await conn.createRoom()
      setStatusMessage('Creating your room…')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room')
      setLoading(false)
      setPendingAction(null)
      setStatusMessage('')
    }
  }, [replaceConnection])

  const joinRoom = useCallback(
    async (code: string) => {
      setPendingAction('join')
      setLoading(true)
      setError(null)
      setStatusMessage('Connecting to server…')
      try {
        const conn = replaceConnection()
        await conn.joinRoom(code)
        setStatusMessage(`Joining room ${code}…`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to join room')
        setLoading(false)
        setPendingAction(null)
        setStatusMessage('')
      }
    },
    [replaceConnection],
  )

  const leaveRoom = useCallback(() => {
    connectionRef.current?.leaveRoom()
    eventUnsubRef.current?.()
    eventUnsubRef.current = null
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
    setPendingAction(null)
    setLoading(false)
    setError(null)
    setRoomUrlParam(null)
  }, [])

  const closeRoom = useCallback(() => {
    connectionRef.current?.closeRoom()
    eventUnsubRef.current?.()
    eventUnsubRef.current = null
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
    setPendingAction(null)
    setLoading(false)
    setRoomUrlParam(null)
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
      navigate(`/play/${gameId}`, { state: { roomLaunch: true, mode: 'remote' } })
    },
    [session, navigate],
  )

  const suggestGame = useCallback(
    (gameId: string) => {
      const game = getGameById(gameId)
      if (!game || roleRef.current !== 'guest') return

      session?.send({ type: 'room:suggest', gameId, gameName: game.name })
      setLastSuggested({ gameId, gameName: game.name })
    },
    [session],
  )

  const acceptSuggestion = useCallback(() => {
    if (!suggestion || roleRef.current !== 'host') return
    setSuggestion(null)
    navigate(`/game/${suggestion.gameId}`)
  }, [suggestion, navigate])

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
      pendingAction,
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
      roomPanelOpen,
      setRoomPanelOpen,
    }),
    [
      status,
      role,
      roomCode,
      statusMessage,
      error,
      loading,
      pendingAction,
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
      roomPanelOpen,
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
