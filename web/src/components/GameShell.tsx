import { Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRoom } from '../context/RoomContext'
import type { GameDef, GameProps } from '../games/types'
import type { GameMode } from '../lib/multiplayer/types'
import { createLocalSession } from '../lib/multiplayer/session'
import ModePicker from './ModePicker'
import './GameShell.css'

type ShellPhase = 'mode' | 'playing'

interface GameShellProps {
  game: GameDef
}

export default function GameShell({ game }: GameShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const room = useRoom()
  const roomLaunch = !!(location.state as { roomLaunch?: boolean } | null)?.roomLaunch

  const [phase, setPhase] = useState<ShellPhase>('mode')
  const [mode, setMode] = useState<GameMode | null>(null)
  const [localSession] = useState(() => createLocalSession())
  const [GameComponent, setGameComponent] = useState<ComponentType<GameProps> | null>(null)

  const disabledModes = useMemo(() => {
    const disabled: GameMode[] = []
    if (game.modes.includes('remote') && !room.isPlayReady) {
      disabled.push('remote')
    }
    return disabled
  }, [game.modes, room.isPlayReady])

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
    const startRemote =
      game.modes.includes('remote') &&
      room.isPlayReady &&
      (roomLaunch || room.isInRoom)

    if (startRemote) {
      setMode('remote')
      setPhase('playing')
      return
    }

    if (game.modes.length === 1) {
      setMode(game.modes[0]!)
      setPhase('playing')
      return
    }

    setPhase('mode')
    setMode(null)
  }, [roomLaunch, room.isInRoom, game.modes, room.isPlayReady])

  const activeSession = mode === 'remote' && room.session ? room.session : localSession

  const handleModeSelect = useCallback((selected: GameMode) => {
    setMode(selected)
    setPhase('playing')
  }, [])

  const handleExit = useCallback(() => {
    navigate('/')
  }, [navigate])

  const handleBack = useCallback(() => {
    if (room.isInRoom) {
      navigate('/')
      return
    }
    if (phase === 'playing' && game.modes.length > 1) {
      setPhase('mode')
      setMode(null)
      return
    }
    navigate('/')
  }, [phase, game.modes.length, navigate, room.isInRoom])

  const showModePicker = phase === 'mode' && game.modes.length > 1

  return (
    <div className="game-shell">
      <header className="game-shell__header">
        <button type="button" className="game-shell__back btn-ghost" onClick={handleBack} aria-label="Back">
          ←
        </button>
        <h1 className="game-shell__title">
          <span aria-hidden>{game.icon}</span> {game.name}
        </h1>
      </header>

      {room.isInRoom && game.modes.includes('remote') && !room.isPlayReady && (
        <div className="game-shell__room-banner">
          Join a room and connect on the home page to play remotely.
        </div>
      )}

      <main className="game-shell__main">
        {showModePicker && (
          <ModePicker
            modes={game.modes}
            disabledModes={disabledModes}
            onSelect={handleModeSelect}
          />
        )}

        {phase === 'playing' && mode && GameComponent && (
          <Suspense fallback={<p className="game-shell__loading">Loading game…</p>}>
            <GameComponent
              mode={mode}
              session={activeSession}
              peerAway={mode === 'remote' && room.status === 'peer-away'}
              onExit={handleExit}
            />
          </Suspense>
        )}

        {phase === 'playing' && !GameComponent && (
          <p className="game-shell__loading">Loading game…</p>
        )}
      </main>
    </div>
  )
}
