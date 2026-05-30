import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoom } from '../../context/RoomContext'
import type { GameProps } from '../types'
import { stats } from '../../lib/stats'
import './TicTacToe.css'

type Cell = 'X' | 'O' | null
type Player = 'X' | 'O'

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

interface MoveMessage {
  type: 'move'
  index: number
  player: Player
}

export default function TicTacToe({ mode, session, peerAway = false, onExit }: GameProps) {
  const room = useRoom()
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null))
  const [current, setCurrent] = useState<Player>('X')
  const [winner, setWinner] = useState<Player | 'draw' | null>(null)
  const startTime = useRef(Date.now())
  const gameId = 'tic-tac-toe'

  const isRemote = mode === 'remote'
  const isAI = mode === 'ai'
  const isPassAndPlay = mode === 'pass-and-play'

  const mySymbol: Player =
    isRemote && session?.role === 'guest' ? 'O' : 'X'

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

  const applyMove = useCallback(
    (index: number, player: Player) => {
      setBoard((prev) => {
        if (prev[index] || winner) return prev
        const next = [...prev] as Cell[]
        next[index] = player
        const w = checkWinner(next)
        if (w) {
          setWinner(w)
          const duration = Date.now() - startTime.current
          stats.recordPlay(gameId, duration)
          if (w === 'draw') stats.recordResult(gameId, 'draw')
          else if (isAI) stats.recordResult(gameId, w === 'X' ? 'win' : 'loss')
          else if (isRemote) {
            const won =
              (w === 'X' && session?.role === 'host') ||
              (w === 'O' && session?.role === 'guest')
            stats.recordResult(gameId, won ? 'win' : 'loss')
          }
        }
        return next
      })
      setCurrent((p) => (p === 'X' ? 'O' : 'X'))
    },
    [winner, isAI, isRemote, session],
  )

  useEffect(() => {
    if (!session || !isRemote) return
    return session.onMessage((msg) => {
      const m = msg as MoveMessage
      if (m.type === 'move') applyMove(m.index, m.player)
    })
  }, [session, isRemote, applyMove])

  useEffect(() => {
    if (!isAI || current !== 'O' || winner) return
    const t = setTimeout(() => {
      setBoard((prev) => {
        if (checkWinner(prev)) return prev
        const idx = bestMove(prev, 'O')
        if (idx < 0) return prev
        const next = [...prev] as Cell[]
        next[idx] = 'O'
        const w = checkWinner(next)
        if (w) {
          setWinner(w)
          const duration = Date.now() - startTime.current
          stats.recordPlay(gameId, duration)
          stats.recordResult(gameId, w === 'O' ? 'loss' : w === 'draw' ? 'draw' : 'win')
        }
        setCurrent('X')
        return next
      })
    }, 400)
    return () => clearTimeout(t)
  }, [isAI, current, winner, board])

  const handleCellClick = (index: number) => {
    if (!canPlay() || board[index]) return

    if (isRemote) {
      const player: Player = session?.role === 'guest' ? 'O' : 'X'
      if (current !== player) return
      session?.send({ type: 'move', index, player } satisfies MoveMessage)
    }

    applyMove(index, current)
  }

  const reset = () => {
    setBoard(Array(9).fill(null))
    setCurrent('X')
    setWinner(null)
    startTime.current = Date.now()
  }

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
      return yourTurn ? 'Your turn' : "Opponent's turn"
    }
    if (isAI) return current === 'X' ? 'Your turn (X)' : 'Computer thinking…'
    if (isPassAndPlay) return `${current}'s turn`
    return ''
  }

  return (
    <div className="ttt">
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
