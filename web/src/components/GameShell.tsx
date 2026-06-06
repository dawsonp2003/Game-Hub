import { Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRoom } from '../context/RoomContext'
import type { GameDef, GameProps } from '../games/types'
import type { GameMode } from '../lib/multiplayer/types'
import type { ComputerOptions } from '../lib/computer-options'
import { resolveComputerOptions } from '../lib/computer-options'
import { createLocalSession } from '../lib/multiplayer/session'
import RoomMenuButton from './RoomMenuButton'
import RoomSuggestionChip from './RoomSuggestionChip'
import './GameShell.css'

type PlayLocationState = {
  roomLaunch?: boolean
  mode?: GameMode
  computerOptions?: ComputerOptions
}

interface GameShellProps {
  game: GameDef
}

export default function GameShell({ game }: GameShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const room = useRoom()
  const locationState = location.state as PlayLocationState | null
  const requestedMode = locationState?.mode
  const requestedComputerOptions = locationState?.computerOptions

  const [mode, setMode] = useState<GameMode | null>(null)
  const [computerOptions, setComputerOptions] = useState<ComputerOptions | undefined>()
  const [localSession] = useState(() => createLocalSession())
  const [GameComponent, setGameComponent] = useState<ComponentType<GameProps> | null>(null)

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
    requestedComputerOptions,
    game.computerOptions,
    navigate,
  ])

  const activeSession = useMemo(
    () => (mode === 'remote' && room.session ? room.session : localSession),
    [mode, room.session, localSession],
  )

  const handleExit = useCallback(() => {
    navigate(`/game/${game.id}`)
  }, [navigate, game.id])

  const handleBack = useCallback(() => {
    if (room.isInRoom) {
      navigate('/')
      return
    }
    navigate(`/game/${game.id}`)
  }, [game.id, navigate, room.isInRoom])

  return (
    <div className="game-shell">
      <header className="game-shell__header">
        <button type="button" className="game-shell__back btn-ghost" onClick={handleBack} aria-label="Back">
          ←
        </button>
        <h1 className="game-shell__title">
          <span aria-hidden>{game.icon}</span> {game.name}
        </h1>
        {(room.isInRoom || room.roomPanelOpen) && <RoomMenuButton />}
      </header>

      {room.role === 'host' && room.suggestion && !room.roomPanelOpen && (
        <div className="game-shell__room-extras">
          <RoomSuggestionChip />
        </div>
      )}

      {room.isInRoom && game.modes.includes('remote') && !room.isPlayReady && (
        <div className="game-shell__room-banner">
          Join a room and connect on the home page to play remotely.
        </div>
      )}

      <main className="game-shell__main">
        {mode && GameComponent && (
          <Suspense fallback={<p className="game-shell__loading">Loading game…</p>}>
            <GameComponent
              mode={mode}
              session={activeSession}
              peerAway={mode === 'remote' && room.status === 'peer-away'}
              computerOptions={mode === 'ai' ? computerOptions : undefined}
              onExit={handleExit}
            />
          </Suspense>
        )}

        {mode && !GameComponent && <p className="game-shell__loading">Loading game…</p>}
      </main>
    </div>
  )
}
