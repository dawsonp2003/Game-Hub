import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useRoom } from '../context/RoomContext'
import type { GameDef, GameProps } from '../games/types'
import { useUnloadGuard } from '../hooks/useUnloadGuard'
import {
  clearLocalCheckpoint,
  hasLocalCheckpoint,
  loadLocalCheckpoint,
} from '../lib/checkpoint'
import type { GameMode } from '../lib/multiplayer/types'
import { MODE_LABELS } from '../lib/multiplayer/types'
import type { ComputerOptions } from '../lib/computer-options'
import { resolveComputerOptions } from '../lib/computer-options'
import { createAsyncMatchSession } from '../lib/multiplayer/async-session'
import { createLocalSession, type MultiplayerSession } from '../lib/multiplayer/session'
import ContinueGamePrompt from './ContinueGamePrompt'
import GameHowToModal from './GameHowToModal'
import InfoIcon from './InfoIcon'
import RoomMenuButton from './RoomMenuButton'
import RoomSuggestionChip from './RoomSuggestionChip'
import './GameShell.css'

type PlayLocationState = {
  roomLaunch?: boolean
  mode?: GameMode
  computerOptions?: ComputerOptions
  matchId?: string
  fromAccount?: boolean
  freshStart?: boolean
}

interface GameShellProps {
  game: GameDef
}

export default function GameShell({ game }: GameShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  const room = useRoom()
  const locationState = location.state as PlayLocationState | null
  const requestedMode = locationState?.mode
  const requestedComputerOptions = locationState?.computerOptions
  const requestedMatchId = locationState?.matchId
  const fromAccount = locationState?.fromAccount === true
  const freshStart = locationState?.freshStart === true

  const [mode, setMode] = useState<GameMode | null>(null)
  const [computerOptions, setComputerOptions] = useState<ComputerOptions | undefined>()
  const [howToOpen, setHowToOpen] = useState(false)
  const [localSession] = useState(() => createLocalSession())
  const [asyncSession, setAsyncSession] = useState<MultiplayerSession | null>(null)
  const [asyncLoading, setAsyncLoading] = useState(false)
  const [asyncError, setAsyncError] = useState<string | null>(null)
  const asyncSessionGen = useRef(0)
  const [GameComponent, setGameComponent] = useState<ComponentType<GameProps> | null>(null)

  const [resumeChoice, setResumeChoice] = useState<'pending' | 'continue' | 'new'>('pending')
  const [initialCheckpoint, setInitialCheckpoint] = useState<unknown>(undefined)

  const checkpointEnabled =
    !!mode &&
    !!game.checkpointModes?.includes(mode) &&
    mode !== 'async' &&
    !!auth.user &&
    !freshStart

  useUnloadGuard(auth.isPermanent && checkpointEnabled)

  useEffect(() => {
    let cancelled = false
    game.load().then((mod) => {
      if (!cancelled) setGameComponent(() => mod.default)
    })
    return () => {
      cancelled = true
    }
  }, [game])

  useEffect(() => {
    if (requestedMode === 'remote' && game.modes.includes('remote')) {
      if (!room.isPlayReady) {
        navigate(`/game/${game.id}`, { replace: true })
        return
      }
      setMode('remote')
      return
    }

    if (requestedMode === 'async' && game.modes.includes('async')) {
      if (!requestedMatchId) {
        navigate(`/game/${game.id}`, { replace: true })
        return
      }
      setMode('async')
      setResumeChoice('continue')
      return
    }

    if (requestedMode && game.modes.includes(requestedMode)) {
      setMode(requestedMode)
      if (requestedMode === 'ai' && game.computerOptions) {
        setComputerOptions(resolveComputerOptions(game.computerOptions, requestedComputerOptions))
      } else {
        setComputerOptions(undefined)
      }
      return
    }

    if (game.modes.length === 1) {
      setMode(game.modes[0]!)
      return
    }

    navigate(`/game/${game.id}`, { replace: true })
  }, [
    game.modes,
    game.id,
    room.isPlayReady,
    requestedMode,
    requestedMatchId,
    requestedComputerOptions,
    game.computerOptions,
    navigate,
  ])

  useEffect(() => {
    if (!checkpointEnabled || !mode || !auth.user) {
      setResumeChoice('continue')
      return
    }
    if (freshStart) {
      clearLocalCheckpoint(auth.user.id, game.id, mode)
      setResumeChoice('new')
      setInitialCheckpoint(undefined)
      return
    }
    if (hasLocalCheckpoint(auth.user.id, game.id, mode)) {
      setResumeChoice('pending')
    } else {
      setResumeChoice('continue')
    }
  }, [checkpointEnabled, mode, auth.user, game.id, freshStart])

  useEffect(() => {
    if (mode !== 'async' || !requestedMatchId) {
      setAsyncSession(null)
      setAsyncError(null)
      return
    }

    const gen = ++asyncSessionGen.current
    let cancelled = false
    setAsyncLoading(true)
    setAsyncError(null)
    setAsyncSession(null)

    createAsyncMatchSession(requestedMatchId, (msg) => {
      if (!cancelled && gen === asyncSessionGen.current) setAsyncError(msg)
    })
      .then((session) => {
        if (cancelled || gen !== asyncSessionGen.current) {
          session.disconnect()
          return
        }
        setAsyncSession(session)
        setAsyncLoading(false)
      })
      .catch((err) => {
        if (!cancelled && gen === asyncSessionGen.current) {
          setAsyncError(err instanceof Error ? err.message : 'Could not load match')
          setAsyncLoading(false)
        }
      })

    return () => {
      cancelled = true
      setAsyncSession((prev) => {
        prev?.disconnect()
        return null
      })
    }
  }, [mode, requestedMatchId])

  const activeSession = useMemo(
    () =>
      mode === 'remote' && room.session
        ? room.session
        : mode === 'async'
          ? asyncSession
          : localSession,
    [mode, room.session, asyncSession, localSession],
  )

  const handleExit = useCallback(() => {
    if (fromAccount) {
      navigate('/', { state: { openAccount: true } })
      return
    }
    navigate(`/game/${game.id}`)
  }, [navigate, game.id, fromAccount])

  const handleBack = useCallback(() => {
    if (fromAccount) {
      navigate('/', { state: { openAccount: true } })
      return
    }
    if (room.isInRoom) {
      navigate('/')
      return
    }
    navigate(`/game/${game.id}`)
  }, [game.id, navigate, room.isInRoom, fromAccount])

  const handleContinueSaved = useCallback(() => {
    if (!auth.user || !mode) return
    const cp = loadLocalCheckpoint(auth.user.id, game.id, mode)
    setInitialCheckpoint(cp?.state)
    setResumeChoice('continue')
  }, [auth.user, game.id, mode])

  const handleStartNew = useCallback(() => {
    if (auth.user && mode) {
      clearLocalCheckpoint(auth.user.id, game.id, mode)
    }
    setInitialCheckpoint(undefined)
    setResumeChoice('new')
  }, [auth.user, game.id, mode])

  const handleCheckpointClear = useCallback(() => {
    if (auth.user && mode) {
      clearLocalCheckpoint(auth.user.id, game.id, mode)
    }
  }, [auth.user, game.id, mode])

  const showResumePrompt = checkpointEnabled && resumeChoice === 'pending' && mode

  const readyToPlay =
    mode &&
    GameComponent &&
    !showResumePrompt &&
    resumeChoice !== 'pending' &&
    (mode !== 'async' || (!asyncLoading && asyncSession && !asyncError))

  return (
    <div className="game-shell">
      <header className="game-shell__header">
        <button type="button" className="game-shell__back btn-ghost" onClick={handleBack} aria-label="Back">
          ←
        </button>
        <h1 className="game-shell__title">
          <span aria-hidden>{game.icon}</span> {game.name}
        </h1>
        <button
          type="button"
          className="game-shell__info"
          onClick={() => setHowToOpen(true)}
          aria-label="How to play"
        >
          <InfoIcon />
        </button>
        {(room.isInRoom || room.roomPanelOpen) && <RoomMenuButton />}
      </header>

      {room.role === 'host' && room.suggestion && !room.roomPanelOpen && (
        <div className="game-shell__room-extras">
          <RoomSuggestionChip />
        </div>
      )}

      <main className="game-shell__main">
        {asyncError && mode === 'async' && (
          <p className="game-shell__loading game-shell__error">{asyncError}</p>
        )}

        {asyncLoading && mode === 'async' && (
          <p className="game-shell__loading">Loading saved game…</p>
        )}

        {showResumePrompt && (
          <ContinueGamePrompt
            gameName={game.name}
            modeLabel={MODE_LABELS[mode]}
            onContinue={handleContinueSaved}
            onNewGame={handleStartNew}
          />
        )}

        {readyToPlay && (
          <Suspense fallback={<p className="game-shell__loading">Loading game…</p>}>
            <GameComponent
              mode={mode}
              session={activeSession}
              peerAway={mode === 'remote' && room.status === 'peer-away'}
              computerOptions={mode === 'ai' ? computerOptions : undefined}
              asyncMatchId={mode === 'async' ? requestedMatchId : undefined}
              initialCheckpoint={initialCheckpoint}
              onCheckpointClear={handleCheckpointClear}
              onExit={handleExit}
            />
          </Suspense>
        )}

        {mode && !GameComponent && <p className="game-shell__loading">Loading game…</p>}
      </main>

      {howToOpen && (
        <GameHowToModal
          gameName={game.name}
          howToPlay={game.howToPlay}
          onClose={() => setHowToOpen(false)}
        />
      )}
    </div>
  )
}
