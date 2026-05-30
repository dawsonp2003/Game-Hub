import { Suspense, useCallback, useEffect, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameDef } from '../games/types'
import type { GameMode } from '../lib/multiplayer/types'
import { useGameSession } from '../hooks/useGameSession'
import ModePicker from './ModePicker'
import RemoteLobby from './RemoteLobby'
import './GameShell.css'

type ShellPhase = 'mode' | 'remote-lobby' | 'playing'

interface GameShellProps {
  game: GameDef
}

export default function GameShell({ game }: GameShellProps) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<ShellPhase>(game.modes.length === 1 ? 'playing' : 'mode')
  const [mode, setMode] = useState<GameMode | null>(
    game.modes.length === 1 ? game.modes[0]! : null,
  )
  const [GameComponent, setGameComponent] = useState<ComponentType<
    import('../games/types').GameProps
  > | null>(null)

  const { session, loading, error, status, roomCode, connectRemote } = useGameSession(mode)

  useEffect(() => {
    let cancelled = false
    game.load().then((mod) => {
      if (!cancelled) setGameComponent(() => mod.default)
    })
    return () => {
      cancelled = true
    }
  }, [game])

  const handleModeSelect = useCallback((selected: GameMode) => {
    setMode(selected)
    if (selected === 'remote') {
      setPhase('remote-lobby')
    } else {
      setPhase('playing')
    }
  }, [])

  useEffect(() => {
    if (mode === 'remote' && session?.isConnected && phase === 'remote-lobby') {
      setPhase('playing')
    }
  }, [mode, session, phase])

  const handleExit = useCallback(() => {
    session?.disconnect()
    navigate('/')
  }, [navigate, session])

  const handleBack = useCallback(() => {
    if (phase === 'playing') {
      session?.disconnect()
      if (game.modes.length === 1) {
        navigate('/')
      } else {
        setPhase('mode')
        setMode(null)
      }
    } else if (phase === 'remote-lobby') {
      session?.disconnect()
      setPhase('mode')
      setMode(null)
    } else {
      navigate('/')
    }
  }, [phase, game.modes.length, navigate, session])

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

      <main className="game-shell__main">
        {phase === 'mode' && <ModePicker modes={game.modes} onSelect={handleModeSelect} />}

        {phase === 'remote-lobby' && mode === 'remote' && (
          <RemoteLobby
            loading={loading}
            error={error}
            status={status}
            roomCode={roomCode}
            onHost={() => connectRemote('host')}
            onJoin={(code) => connectRemote('guest', code)}
            onBack={handleBack}
          />
        )}

        {phase === 'playing' && mode && GameComponent && (
          <Suspense fallback={<p className="game-shell__loading">Loading game…</p>}>
            <GameComponent mode={mode} session={session} onExit={handleExit} />
          </Suspense>
        )}

        {phase === 'playing' && !GameComponent && (
          <p className="game-shell__loading">Loading game…</p>
        )}
      </main>
    </div>
  )
}
