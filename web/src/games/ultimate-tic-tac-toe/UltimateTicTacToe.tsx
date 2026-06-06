import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { useRoom } from '../../context/RoomContext'
import { getComputerOptionString } from '../../lib/computer-options'
import type { GameProps } from '../types'
import { recordGameEnd } from '../../lib/stats'
import UltimateTicTacToeBoard, { statusForState } from './UltimateTicTacToeBoard'
import {
  applyMove,
  createInitialState,
  parseUtttDifficulty,
  pickAiMove,
  type Player,
  type UtttMove,
  type UtttState,
} from './uttt-engine'
import './UltimateTicTacToe.css'

type UtttMessage =
  | { type: 'uttt:move'; board: number; cell: number; player: Player }
  | { type: 'uttt:reset'; firstPlayer: Player }

function nextFirst(current: Player): Player {
  return current === 'X' ? 'O' : 'X'
}

export default function UltimateTicTacToe({
  mode,
  session,
  peerAway = false,
  computerOptions,
  onExit,
}: GameProps) {
  const room = useRoom()
  const [firstPlayer, setFirstPlayer] = useState<Player>('X')
  const [state, setState] = useState<UtttState>(() => createInitialState('X'))
  const [lastMove, setLastMove] = useState<UtttMove | null>(null)
  const stateRef = useRef(state)
  const startTime = useRef(Date.now())
  const gameId = 'ultimate-tic-tac-toe'

  stateRef.current = state

  const isRemote = mode === 'remote'
  const isAI = mode === 'ai'
  const isPassAndPlay = mode === 'pass-and-play'
  const aiDifficulty = useMemo(
    () => parseUtttDifficulty(getComputerOptionString(computerOptions, 'difficulty', 'normal')),
    [computerOptions],
  )

  const mySymbol: Player = isRemote && session?.role === 'guest' ? 'O' : 'X'

  const canPlayLocal = useCallback(() => {
    if (state.macroWinner) return false
    if (peerAway || room.status === 'peer-away') return false
    if (isRemote) {
      if (!room.isPlayReady) return false
      const turn = state.current === 'X' ? 'host' : 'guest'
      return session?.role === turn
    }
    if (isAI && state.current === 'O') return false
    return true
  }, [
    state.macroWinner,
    state.current,
    peerAway,
    room.status,
    room.isPlayReady,
    isRemote,
    isAI,
    session?.role,
  ])

  const canPlay = canPlayLocal()

  const victoryHeadline = (() => {
    if (!state.macroWinner || state.macroWinner === 'draw') return ''
    if (isAI) return state.macroWinner === 'X' ? 'You win!' : ''
    if (isRemote) return state.macroWinner === mySymbol ? 'You win!' : ''
    return `${state.macroWinner} wins!`
  })()
  useVictoryConfetti(victoryHeadline)

  const recordEnd = useCallback(
    (winner: Player | 'draw') => {
      let result: 'win' | 'loss' | 'draw' | undefined
      if (winner === 'draw') result = 'draw'
      else if (isAI) result = winner === 'X' ? 'win' : 'loss'
      else if (isRemote) result = winner === mySymbol ? 'win' : 'loss'
      recordGameEnd({
        gameId,
        mode,
        result,
        turns: stateRef.current.cells.filter(Boolean).length,
        durationMs: Date.now() - startTime.current,
        startedAt: startTime.current,
      })
    },
    [isAI, isRemote, mySymbol, mode],
  )

  const playMove = useCallback(
    (move: UtttMove, fromNetwork = false) => {
      const prev = stateRef.current
      if (prev.macroWinner) return

      const player = prev.current
      const next = applyMove(prev, move)
      if (next.cells[move.board * 9 + move.cell] !== player) return

      stateRef.current = next
      setState(next)
      setLastMove(move)

      if (next.macroWinner && !prev.macroWinner) {
        recordEnd(next.macroWinner)
      }

      if (isRemote && !fromNetwork) {
        session?.send({
          type: 'uttt:move',
          board: move.board,
          cell: move.cell,
          player,
        } satisfies UtttMessage)
      }
    },
    [isRemote, session, recordEnd],
  )

  useEffect(() => {
    if (!session || !isRemote) return
    return session.onMessage((msg) => {
      const m = msg as UtttMessage
      if (m.type === 'uttt:move') {
        const prev = stateRef.current
        if (m.player !== prev.current) return
        playMove({ board: m.board, cell: m.cell }, true)
      }
      if (m.type === 'uttt:reset') {
        const s = createInitialState(m.firstPlayer)
        stateRef.current = s
        setState(s)
        setFirstPlayer(m.firstPlayer)
        setLastMove(null)
        startTime.current = Date.now()
      }
    })
  }, [session, isRemote, playMove])

  useEffect(() => {
    if (!isAI || state.current !== 'O' || state.macroWinner) return
    const t = setTimeout(() => {
      const move = pickAiMove(stateRef.current, 'O', aiDifficulty)
      if (move) playMove(move)
    }, 450)
    return () => clearTimeout(t)
  }, [isAI, state.current, state.macroWinner, playMove, aiDifficulty])

  const reset = () => {
    const first = nextFirst(firstPlayer)
    const s = createInitialState(first)
    stateRef.current = s
    setState(s)
    setFirstPlayer(first)
    setLastMove(null)
    startTime.current = Date.now()
    if (isRemote && session) {
      session.send({ type: 'uttt:reset', firstPlayer: first } satisfies UtttMessage)
    }
  }

  const status = statusForState(state, {
    canPlay,
    mySymbol: isRemote ? mySymbol : undefined,
    isRemote,
    peerAway,
  })

  const playerTag = () => {
    if (isPassAndPlay && !state.macroWinner) return `${state.current}'s turn`
    if (isAI && !state.macroWinner) return state.current === 'X' ? 'Your turn (X)' : 'Computer thinking…'
    return null
  }

  const tag = playerTag()

  return (
    <div className="uttt">
      {tag && <p className="uttt__you">{tag}</p>}
      {isRemote && (
        <p className="uttt__you">
          You are <strong>{mySymbol}</strong>
        </p>
      )}

      <p
        className={`uttt__status ${state.macroWinner && state.macroWinner !== 'draw' ? 'uttt__status--win' : ''}`}
      >
        {peerAway && !state.macroWinner
          ? status
          : isRemote && !room.isPlayReady && !state.macroWinner
            ? 'Connecting…'
            : status}
      </p>

      <UltimateTicTacToeBoard
        state={state}
        canPlay={canPlay}
        lastMove={lastMove}
        onCellClick={(move) => playMove(move)}
      />

      <p className="uttt__hint">Pinch or drag to pan the board on small screens.</p>

      {state.macroWinner && (
        <div className="uttt__actions">
          <button type="button" className="btn" onClick={reset}>
            Play again
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      )}
    </div>
  )
}
