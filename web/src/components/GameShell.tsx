import { Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const room = useRoom()
  const supportsRemote = game.modes.includes('remote')

  const [phase, setPhase] = useState<ShellPhase>('mode')
  const [mode, setMode] = useState<GameMode | null>(null)
  const [localSession] = useState(() => createLocalSession())
  const [GameComponent, setGameComponent] = useState<ComponentType<GameProps> | null>(null)

  const availableModes = useMemo(() => {
    if (room.isInRoom) {
      return game.modes.filter((m) => m !== 'remote')
    }
    return game.modes
  }, [game.modes, room.isInRoom])

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
    if (supportsRemote && room.isPlayReady) {
      setMode('remote')
      setPhase('playing')
      return
    }

    if (availableModes.length === 1) {
      setMode(availableModes[0]!)
      setPhase('playing')
      return
    }

    setPhase('mode')
    setMode(null)
  }, [supportsRemote, room.isPlayReady, availableModes])

  const activeSession = mode === 'remote' && room.session ? room.session : localSession

  const handleModeSelect = useCallback((selected: GameMode) => {
    setMode(selected)
    setPhase('playing')
  }, [])

  const handleExit = useCallback(() => {
    navigate('/')
  }, [navigate])

  const handleBack = useCallback(() => {
    if (phase === 'playing' && availableModes.length > 1) {
      setPhase('mode')
      setMode(null)
    } else {
      navigate('/')
    }
  }, [phase, availableModes.length, navigate])

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

      {room.isInRoom && supportsRemote && !room.isPlayReady && (
        <div className="game-shell__room-banner">
          Room {room.roomCode}: {room.statusMessage || 'Waiting for friend…'}
        </div>
      )}

      <main className="game-shell__main">
        {phase === 'mode' && availableModes.length > 1 && (
          <ModePicker modes={availableModes} onSelect={handleModeSelect} />
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
