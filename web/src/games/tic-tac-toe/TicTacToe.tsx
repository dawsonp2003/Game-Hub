import { useCallback, useEffect, useRef, useState } from 'react'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { useRoom } from '../../context/RoomContext'
import type { GameProps } from '../types'
import { recordGameEnd } from '../../lib/stats'
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

function bestMove(board: Cell[], ai: Player): number {
  const opponent: Player = ai === 'X' ? 'O' : 'X'

  const minimax = (b: Cell[], isMax: boolean): number => {
    const w = checkWinner(b)
    if (w === ai) return 1
    if (w === opponent) return -1
    if (w === 'draw') return 0

    const player = isMax ? ai : opponent
    let best = isMax ? -Infinity : Infinity

    for (let i = 0; i < 9; i++) {
      if (b[i]) continue
      const next = [...b] as Cell[]
      next[i] = player
      const score = minimax(next, !isMax)
      best = isMax ? Math.max(best, score) : Math.min(best, score)
    }
    return best
  }

  let bestScore = -Infinity
  let move = -1
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue
    const next = [...board] as Cell[]
    next[i] = ai
    const score = minimax(next, false)
    if (score > bestScore) {
      bestScore = score
      move = i
    }
  }
  return move
}

type TttMessage =
  | { type: 'move'; index: number; player: Player }
  | { type: 'ttt:reset'; firstPlayer: Player }
  | { type: 'ttt:session-score'; wins: SessionWins }

function nextFirstPlayer(current: Player): Player {
  return current === 'X' ? 'O' : 'X'
}

export default function TicTacToe({ mode, session, peerAway = false, onExit }: GameProps) {
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

  const isRemote = mode === 'remote'
  const isAI = mode === 'ai'
  const isPassAndPlay = mode === 'pass-and-play'

  const mySymbol: Player = isRemote && session?.role === 'guest' ? 'O' : 'X'

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
    if (isRemote) {
      if (!room.isPlayReady) return false
      const turn = current === 'X' ? 'host' : 'guest'
      return session?.role === turn
    }
    if (isAI && current === 'O') return false
    return true
  }, [winner, peerAway, room.status, room.isPlayReady, isRemote, isAI, session, current])

  const finishRound = useCallback(
    (w: Player | 'draw') => {
      setWinner(w)
      const duration = Date.now() - startTime.current
      let result: 'win' | 'loss' | 'draw' | undefined
      if (w === 'draw') result = 'draw'
      else if (isAI) result = w === 'X' ? 'win' : 'loss'
      else if (isRemote) {
        const won =
          (w === 'X' && session?.role === 'host') ||
          (w === 'O' && session?.role === 'guest')
        result = won ? 'win' : 'loss'
      }
      recordGameEnd({
        gameId,
        mode,
        result,
        turns: boardRef.current.filter(Boolean).length,
        durationMs: duration,
        startedAt: startTime.current,
      })
      if (isRemote) recordSessionWin(w)
    },
    [isAI, isRemote, session?.role, recordSessionWin, mode],
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
    if (!session || !isRemote) return
    return session.onMessage((msg) => {
      const m = msg as TttMessage
      if (m.type === 'move') applyMove(m.index, m.player)
      if (m.type === 'ttt:reset') resetBoard(m.firstPlayer)
      if (m.type === 'ttt:session-score') setSessionWins(m.wins)
    })
  }, [session, isRemote, applyMove, resetBoard])

  useEffect(() => {
    if (!isAI || current !== 'O' || winner) return
    const t = setTimeout(() => {
      const prev = boardRef.current
      if (checkWinner(prev)) return
      const idx = bestMove(prev, 'O')
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
  }, [isAI, current, winner, finishRound])

  const handleCellClick = (index: number) => {
    if (!canPlay() || board[index]) return

    if (isRemote) {
      const player: Player = session?.role === 'guest' ? 'O' : 'X'
      if (current !== player) return
      session?.send({ type: 'move', index, player } satisfies TttMessage)
    }

    applyMove(index, current)
  }

  const reset = () => {
    const nextFirst = nextFirstPlayer(firstPlayer)
    resetBoard(nextFirst)
    if (isRemote && session) {
      session.send({ type: 'ttt:reset', firstPlayer: nextFirst } satisfies TttMessage)
    }
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
    else if (isRemote) {
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
      if (isRemote) {
        const won =
          (winner === 'X' && session?.role === 'host') ||
          (winner === 'O' && session?.role === 'guest')
        return won ? 'You win!' : 'You lose!'
      }
      return `${winner} wins!`
    }
    if (peerAway || room.status === 'peer-away') {
      return 'Friend stepped away — board preserved. They can rejoin from the menu.'
    }
    if (isRemote && !room.isPlayReady) return 'Connecting…'
    if (isRemote) {
      const yourTurn =
        (current === 'X' && session?.role === 'host') ||
        (current === 'O' && session?.role === 'guest')
      if (!winner && board.every((c) => !c)) {
        const youGoFirst =
          (firstPlayer === 'X' && session?.role === 'host') ||
          (firstPlayer === 'O' && session?.role === 'guest')
        return youGoFirst ? 'You go first' : 'Friend goes first'
      }
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
      {isRemote && (
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
          <button type="button" className="btn" onClick={reset}>
            Play Again
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      )}
      {isRemote && (
        <p className="ttt__you">
          You are <strong>{mySymbol}</strong>
        </p>
      )}
    </div>
  )
}
