import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { useIsMobileViewport } from '../../hooks/usePinchPanZoom'
import { useAuth } from '../../context/AuthContext'
import { useRoom } from '../../context/RoomContext'
import { getComputerOptionString } from '../../lib/computer-options'
import { firstPlayerFromAsyncMatch } from '../../lib/turn-order/async-opening'
import {
  getNextTurnSlot,
  prefetchTurnOrder,
  rotateTurnSlot,
  xFromSlot,
  type TurnSlot,
} from '../../lib/turn-order'
import type { GameProps } from '../types'
import { AsyncMatchSession } from '../../lib/multiplayer/async-session'
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
  const gameId = 'ultimate-tic-tac-toe'
  const auth = useAuth()
  const room = useRoom()
  const isMobile = useIsMobileViewport()
  const openingSlotRef = useRef<TurnSlot | null>(null)

  const resolveOpening = (): Player => {
    if (mode === 'async' && session instanceof AsyncMatchSession) {
      const match = session.getMatch()
      if (match) return firstPlayerFromAsyncMatch(match)
    }
    if (mode === 'ai' || mode === 'pass-and-play') {
      const slot = getNextTurnSlot(auth.user?.id, gameId, mode)
      openingSlotRef.current = slot
      return xFromSlot(slot)
    }
    return 'X'
  }

  const opening = resolveOpening()
  const [firstPlayer, setFirstPlayer] = useState<Player>(opening)
  const [state, setState] = useState<UtttState>(() => createInitialState(opening))
  const [lastMove, setLastMove] = useState<UtttMove | null>(null)
  const stateRef = useRef(state)
  const startTime = useRef(Date.now())

  stateRef.current = state

  useEffect(() => {
    if (mode === 'ai' || mode === 'pass-and-play') {
      prefetchTurnOrder(auth.user?.id, gameId, mode)
    }
  }, [auth.user?.id, gameId, mode])

  const isAsync = mode === 'async'
  const isRemote = mode === 'remote'
  const isNetworked = isRemote || isAsync
  const isAI = mode === 'ai'
  const isPassAndPlay = mode === 'pass-and-play'
  const aiDifficulty = useMemo(
    () => parseUtttDifficulty(getComputerOptionString(computerOptions, 'difficulty', 'normal')),
    [computerOptions],
  )

  const mySymbol: Player = isNetworked && session?.role === 'guest' ? 'O' : 'X'

  const canPlayLocal = useCallback(() => {
    if (state.macroWinner) return false
    if (peerAway || room.status === 'peer-away') return false
    if (isNetworked) {
      if (isRemote && !room.isPlayReady) return false
      if (isAsync && !session?.isConnected) return false
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
    isNetworked,
    isRemote,
    isAsync,
    isAI,
    session?.role,
    session?.isConnected,
  ])

  const canPlay = canPlayLocal()

  const victoryHeadline = (() => {
    if (!state.macroWinner || state.macroWinner === 'draw') return ''
    if (isAI) return state.macroWinner === 'X' ? 'You win!' : ''
    if (isNetworked) return state.macroWinner === mySymbol ? 'You win!' : ''
    return `${state.macroWinner} wins!`
  })()
  useVictoryConfetti(victoryHeadline)

  const recordEnd = useCallback(
    (winner: Player | 'draw') => {
      let result: 'win' | 'loss' | 'draw' | undefined
      if (winner === 'draw') result = 'draw'
      else if (isAI) result = winner === 'X' ? 'win' : 'loss'
      else if (isNetworked) result = winner === mySymbol ? 'win' : 'loss'
      if (isAsync && session?.markFinished) {
        void session.markFinished((session as AsyncMatchSession).winnerUserId(winner))
      }
      recordGameEnd({
        gameId,
        mode,
        result,
        turns: stateRef.current.cells.filter(Boolean).length,
        durationMs: Date.now() - startTime.current,
        startedAt: startTime.current,
        computerOptions: isAI ? computerOptions : undefined,
        opponentUserId:
          isAsync && session instanceof AsyncMatchSession
            ? session.opponentUserId() ?? undefined
            : undefined,
      })
      if (mode === 'ai' || mode === 'pass-and-play') {
        const slot = openingSlotRef.current ?? (firstPlayer === 'O' ? 'player2' : 'player1')
        rotateTurnSlot(auth.user?.id, gameId, mode, slot)
      }
    },
    [isAI, isNetworked, isAsync, session, mySymbol, mode, computerOptions, auth.user?.id, firstPlayer],
  )

  const playMove = useCallback(
    (move: UtttMove, fromNetwork = false) => {
      const prev = stateRef.current
      if (prev.macroWinner) return

      const player = prev.current
      const next = applyMove(prev, move)
      if (next.cells[move.board * 9 + move.cell] !== player) return

      const commit = () => {
        stateRef.current = next
        setState(next)
        setLastMove(move)
        if (next.macroWinner && !prev.macroWinner) {
          recordEnd(next.macroWinner)
        }
      }

      if (fromNetwork || !isNetworked) {
        commit()
        return
      }

      const msg = {
        type: 'uttt:move',
        board: move.board,
        cell: move.cell,
        player,
      } satisfies UtttMessage

      if (isAsync && session) {
        void (session as AsyncMatchSession).sendMove(msg).then(commit)
        return
      }

      commit()
      session?.send(msg)
    },
    [isNetworked, isAsync, session, recordEnd],
  )

  useEffect(() => {
    if (!session || !isNetworked) return
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
  }, [session, isNetworked, playMove])

  useEffect(() => {
    if (!isAI || state.current !== 'O' || state.macroWinner) return
    const thinkMs = aiDifficulty === 'expert' ? 50 : 450
    const t = setTimeout(() => {
      const move = pickAiMove(stateRef.current, 'O', aiDifficulty)
      if (move) playMove(move)
    }, thinkMs)
    return () => clearTimeout(t)
  }, [isAI, state.current, state.macroWinner, playMove, aiDifficulty])

  const reset = () => {
    let first: Player
    if (mode === 'ai' || mode === 'pass-and-play') {
      const slot = getNextTurnSlot(auth.user?.id, gameId, mode)
      openingSlotRef.current = slot
      first = xFromSlot(slot)
    } else {
      first = nextFirst(firstPlayer)
    }
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
    mySymbol: isNetworked ? mySymbol : undefined,
    isRemote: isNetworked,
    peerAway: isRemote ? peerAway : false,
  })

  const playerTag = () => {
    if (isPassAndPlay && !state.macroWinner) return `${state.current}'s turn`
    if (isAI && !state.macroWinner) {
      if (state.current === 'X') return 'Your turn (X)'
      return aiDifficulty === 'expert' ? 'Computer thinking deeply…' : 'Computer thinking…'
    }
    return null
  }

  const tag = playerTag()

  return (
    <div className="uttt">
      {tag && <p className="uttt__you">{tag}</p>}
      {isNetworked && (
        <p className="uttt__you">
          You are <strong>{mySymbol}</strong>
        </p>
      )}

      <p
        className={`uttt__status ${state.macroWinner && state.macroWinner !== 'draw' ? 'uttt__status--win' : ''}`}
      >
        {isRemote && peerAway && !state.macroWinner
          ? status
          : isRemote && !room.isPlayReady && !state.macroWinner
            ? 'Connecting…'
            : isAsync && !session?.isConnected && !state.macroWinner
              ? 'Loading match…'
              : status}
      </p>

      <UltimateTicTacToeBoard
        state={state}
        canPlay={canPlay}
        lastMove={lastMove}
        onCellClick={(move) => playMove(move)}
      />

      {isMobile && (
        <p className="uttt__hint">Pinch to zoom and drag to pan the board.</p>
      )}

      {state.macroWinner && (
        <div className="uttt__actions">
          {!isAsync && (
            <button type="button" className="btn" onClick={reset}>
              Play again
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      )}
    </div>
  )
}
