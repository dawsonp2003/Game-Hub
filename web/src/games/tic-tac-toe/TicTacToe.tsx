import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { useRoom } from '../../context/RoomContext'
import { getComputerOptionString } from '../../lib/computer-options'
import type { GameProps } from '../types'
import type { AsyncMatchSession } from '../../lib/multiplayer/async-session'
import { recordGameEnd } from '../../lib/stats'
import { parseTttDifficulty, pickAiMove } from './ai'
import './TicTacToe.css'

type Cell = 'X' | 'O' | null
type Player = 'X' | 'O'

interface SessionWins {
  host: number
  guest: number
}

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

function checkWinner(board: Cell[]): Player | 'draw' | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as Player
    }
  }
  if (board.every(Boolean)) return 'draw'
  return null
}

type TttMessage =
  | { type: 'move'; index: number; player: Player }
  | { type: 'ttt:reset'; firstPlayer: Player }
  | { type: 'ttt:session-score'; wins: SessionWins }

function nextFirstPlayer(current: Player): Player {
  return current === 'X' ? 'O' : 'X'
}

export default function TicTacToe({
  mode,
  session,
  peerAway = false,
  computerOptions,
  onExit,
}: GameProps) {
  const room = useRoom()
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null))
  const [firstPlayer, setFirstPlayer] = useState<Player>('X')
  const [current, setCurrent] = useState<Player>('X')
  const [winner, setWinner] = useState<Player | 'draw' | null>(null)
  const [sessionWins, setSessionWins] = useState<SessionWins>({ host: 0, guest: 0 })
  const startTime = useRef(Date.now())
  const roundScoredRef = useRef(false)
  const boardRef = useRef<Cell[]>(board)
  const gameId = 'tic-tac-toe'

  boardRef.current = board

  const isAsync = mode === 'async'
  const isRemote = mode === 'remote'
  const isNetworked = isRemote || isAsync
  const isAI = mode === 'ai'
  const isPassAndPlay = mode === 'pass-and-play'
  const aiDifficulty = useMemo(
    () => parseTttDifficulty(getComputerOptionString(computerOptions, 'difficulty', 'hard')),
    [computerOptions],
  )

  const mySymbol: Player = isNetworked && session?.role === 'guest' ? 'O' : 'X'

  const broadcastSessionScore = useCallback(
    (wins: SessionWins) => {
      if (isRemote && session) {
        session.send({ type: 'ttt:session-score', wins } satisfies TttMessage)
      }
    },
    [isRemote, session],
  )

  const recordSessionWin = useCallback(
    (result: Player | 'draw') => {
      if (!isRemote || result === 'draw' || session?.role !== 'host') return
      if (roundScoredRef.current) return
      roundScoredRef.current = true

      setSessionWins((prev) => {
        const next = { ...prev }
        if (result === 'X') next.host += 1
        else next.guest += 1
        return next
      })
    },
    [isRemote, session?.role],
  )

  useEffect(() => {
    if (!isRemote || session?.role !== 'host') return
    broadcastSessionScore(sessionWins)
  }, [sessionWins, isRemote, session?.role, broadcastSessionScore])

  const resetBoard = useCallback((explicitFirst?: Player) => {
    roundScoredRef.current = false
    const empty = Array(9).fill(null) as Cell[]
    boardRef.current = empty
    setFirstPlayer((prev) => {
      const first = explicitFirst ?? nextFirstPlayer(prev)
      setCurrent(first)
      return first
    })
    setBoard(empty)
    setWinner(null)
    startTime.current = Date.now()
  }, [])

  const canPlay = useCallback(() => {
    if (winner) return false
    if (peerAway || room.status === 'peer-away') return false
    if (isNetworked) {
      if (isRemote && !room.isPlayReady) return false
      if (isAsync && !session?.isConnected) return false
      const turn = current === 'X' ? 'host' : 'guest'
      return session?.role === turn
    }
    if (isAI && current === 'O') return false
    return true
  }, [winner, peerAway, room.status, room.isPlayReady, isNetworked, isRemote, isAsync, isAI, session, current])

  const finishRound = useCallback(
    (w: Player | 'draw') => {
      setWinner(w)
      const duration = Date.now() - startTime.current
      let result: 'win' | 'loss' | 'draw' | undefined
      if (w === 'draw') result = 'draw'
      else if (isAI) result = w === 'X' ? 'win' : 'loss'
      else if (isNetworked) {
        const won =
          (w === 'X' && session?.role === 'host') ||
          (w === 'O' && session?.role === 'guest')
        result = won ? 'win' : 'loss'
      }
      if (isAsync && session?.markFinished) {
        void session.markFinished((session as AsyncMatchSession).winnerUserId(w))
      }
      recordGameEnd({
        gameId,
        mode,
        result,
        turns: boardRef.current.filter(Boolean).length,
        durationMs: duration,
        startedAt: startTime.current,
        computerOptions: isAI ? computerOptions : undefined,
      })
      if (isRemote) recordSessionWin(w)
    },
    [isAI, isNetworked, isAsync, session, recordSessionWin, mode, computerOptions],
  )

  const applyMove = useCallback(
    (index: number, player: Player) => {
      if (winner) return
      const prev = boardRef.current
      if (prev[index]) return

      const next = [...prev] as Cell[]
      next[index] = player
      const outcome = checkWinner(next)

      boardRef.current = next
      setBoard(next)
      setCurrent(player === 'X' ? 'O' : 'X')

      if (outcome) finishRound(outcome)
    },
    [winner, finishRound],
  )

  useEffect(() => {
    if (!session || !isNetworked) return
    return session.onMessage((msg) => {
      const m = msg as TttMessage
      if (m.type === 'move') applyMove(m.index, m.player)
      if (m.type === 'ttt:reset') resetBoard(m.firstPlayer)
      if (m.type === 'ttt:session-score') setSessionWins(m.wins)
    })
  }, [session, isNetworked, applyMove, resetBoard])

  useEffect(() => {
    if (!isAI || current !== 'O' || winner) return
    const t = setTimeout(() => {
      const prev = boardRef.current
      if (checkWinner(prev)) return
      const idx = pickAiMove(prev, 'O', aiDifficulty)
      if (idx < 0) return

      const next = [...prev] as Cell[]
      next[idx] = 'O'
      const outcome = checkWinner(next)

      boardRef.current = next
      setBoard(next)
      setCurrent('X')

      if (outcome) finishRound(outcome)
    }, 400)
    return () => clearTimeout(t)
  }, [isAI, current, winner, finishRound, aiDifficulty])

  const handleCellClick = (index: number) => {
    if (!canPlay() || board[index]) return

    const player: Player =
      isNetworked && session?.role === 'guest' ? 'O' : isNetworked ? 'X' : current

    if (isNetworked) {
      if (current !== player) return
      const msg = { type: 'move', index, player } satisfies TttMessage
      if (isAsync && session) {
        void (session as AsyncMatchSession).sendMove(msg).then(() => applyMove(index, player))
        return
      }
      session?.send(msg)
    }

    applyMove(index, current)
  }

  const reset = () => {
    const nextFirst = nextFirstPlayer(firstPlayer)
    resetBoard(nextFirst)
    if (isRemote && session) {
      session.send({ type: 'ttt:reset', firstPlayer: nextFirst } satisfies TttMessage)
    }
    if (isAsync) return
  }

  const myWins = isRemote
    ? session?.role === 'host'
      ? sessionWins.host
      : sessionWins.guest
    : 0
  const theirWins = isRemote
    ? session?.role === 'host'
      ? sessionWins.guest
      : sessionWins.host
    : 0

  let victoryHeadline = ''
  if (winner && winner !== 'draw') {
    if (isAI && winner === 'X') victoryHeadline = 'You win!'
    else if (isNetworked) {
      const localWin =
        (winner === 'X' && session?.role === 'host') ||
        (winner === 'O' && session?.role === 'guest')
      if (localWin) victoryHeadline = 'You win!'
    } else if (isPassAndPlay) victoryHeadline = `${winner} wins!`
  }
  useVictoryConfetti(victoryHeadline)

  const statusText = () => {
    if (winner === 'draw') return "It's a draw!"
    if (winner) {
      if (isAI) return winner === 'X' ? 'You win!' : 'Computer wins!'
      if (isNetworked) {
        const won =
          (winner === 'X' && session?.role === 'host') ||
          (winner === 'O' && session?.role === 'guest')
        return won ? 'You win!' : 'You lose!'
      }
      return `${winner} wins!`
    }
    if (isRemote && (peerAway || room.status === 'peer-away')) {
      return 'Friend stepped away — board preserved. They can rejoin from the menu.'
    }
    if (isRemote && !room.isPlayReady) return 'Connecting…'
    if (isAsync && !session?.isConnected) return 'Loading match…'
    if (isNetworked) {
      const yourTurn =
        (current === 'X' && session?.role === 'host') ||
        (current === 'O' && session?.role === 'guest')
      if (!winner && board.every((c) => !c)) {
        const youGoFirst =
          (firstPlayer === 'X' && session?.role === 'host') ||
          (firstPlayer === 'O' && session?.role === 'guest')
        return youGoFirst ? 'You go first' : 'Friend goes first'
      }
      if (isAsync && !yourTurn) return "Opponent's turn — check back later"
      return yourTurn ? 'Your turn' : "Opponent's turn"
    }
    if (isAI) return current === 'X' ? 'Your turn (X)' : 'Computer thinking…'
    if (isPassAndPlay) {
      if (!winner && board.every((c) => !c)) return `${firstPlayer} goes first`
      return `${current}'s turn`
    }
    return ''
  }

  return (
    <div className="ttt">
      {isRemote && !isAsync && (
        <div className="ttt__scoreboard" aria-label="Session score">
          <span className="ttt__score-you">You ({mySymbol}): {myWins}</span>
          <span className="ttt__score-them">Friend: {theirWins}</span>
        </div>
      )}
      <p className="ttt__status">{statusText()}</p>
      <div className="ttt__board" role="grid" aria-label="Tic tac toe board">
        {board.map((cell, i) => (
          <button
            key={i}
            type="button"
            className={`ttt__cell ${cell === 'X' ? 'x' : cell === 'O' ? 'o' : ''}`}
            onClick={() => handleCellClick(i)}
            disabled={!!cell || !canPlay()}
            aria-label={cell ? `Cell ${cell}` : `Empty cell ${i + 1}`}
          >
            {cell}
          </button>
        ))}
      </div>
      {winner && (
        <div className="ttt__actions">
          {!isAsync && (
            <button type="button" className="btn" onClick={reset}>
              Play Again
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      )}
      {isNetworked && (
        <p className="ttt__you">
          You are <strong>{mySymbol}</strong>
        </p>
      )}
    </div>
  )
}
