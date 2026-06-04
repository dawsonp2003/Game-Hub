import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { recordGameEnd, stats } from '../../lib/stats'
import './Snake.css'

const GRID = 16
const TICK_MS = 120

type Dir = 'up' | 'down' | 'left' | 'right'
type Point = { x: number; y: number }

function randomFood(snake: Point[]): Point {
  let p: Point
  do {
    p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) }
  } while (snake.some((s) => s.x === p.x && s.y === p.y))
  return p
}

const DIR_DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export default function Snake({ onExit }: GameProps) {
  const [snake, setSnake] = useState<Point[]>([
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
  ])
  const [food, setFood] = useState<Point>(() => ({ x: 12, y: 8 }))
  const [dir, setDir] = useState<Dir>('right')
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [paused, setPaused] = useState(false)
  const dirRef = useRef(dir)
  const scoreRef = useRef(0)
  const startTime = useRef(Date.now())
  const gameId = 'snake'

  dirRef.current = dir
  scoreRef.current = score

  const endGame = useCallback(
    (finalScore: number) => {
      setGameOver(true)
      recordGameEnd({
        gameId,
        mode: 'solo',
        score: finalScore,
        durationMs: Date.now() - startTime.current,
        startedAt: startTime.current,
      })
    },
    [],
  )

  const tick = useCallback(() => {
    if (gameOver || paused) return

    setSnake((prev) => {
      const d = dirRef.current
      const head = prev[0]!
      const delta = DIR_DELTA[d]
      const next = { x: head.x + delta.x, y: head.y + delta.y }

      if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID) {
        endGame(scoreRef.current)
        return prev
      }
      if (prev.some((s) => s.x === next.x && s.y === next.y)) {
        endGame(scoreRef.current)
        return prev
      }

      const ate = next.x === food.x && next.y === food.y
      const newSnake = [next, ...prev]
      if (!ate) newSnake.pop()
      else {
        setScore((s) => s + 1)
        setFood(randomFood(newSnake))
      }
      return newSnake
    })
  }, [food, gameOver, paused, score, endGame])

  useEffect(() => {
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [tick])

  const setDirection = (d: Dir) => {
    setDir((current) => (OPPOSITE[current] === d ? current : d))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
      }
      const d = map[e.key]
      if (d) {
        e.preventDefault()
        setDirection(d)
      }
      if (e.key === ' ') setPaused((p) => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reset = () => {
    setSnake([
      { x: 8, y: 8 },
      { x: 7, y: 8 },
      { x: 6, y: 8 },
    ])
    setFood({ x: 12, y: 8 })
    setDir('right')
    setScore(0)
    setGameOver(false)
    setPaused(false)
    startTime.current = Date.now()
  }

  const cells: { x: number; y: number; type: 'snake' | 'head' | 'food' | 'empty' }[] = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const isHead = snake[0]?.x === x && snake[0]?.y === y
      const isSnake = snake.some((s) => s.x === x && s.y === y)
      const isFood = food.x === x && food.y === y
      cells.push({
        x,
        y,
        type: isHead ? 'head' : isSnake ? 'snake' : isFood ? 'food' : 'empty',
      })
    }
  }

  return (
    <div className="snake-game">
      <div className="snake-game__hud">
        <span>Score: {score}</span>
        <span>Best: {stats.getStats(gameId).bestScore ?? 0}</span>
        <button type="button" className="btn-ghost" onClick={() => setPaused((p) => !p)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      <div
        className="snake-game__board"
        style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}
      >
        {cells.map((c) => (
          <div
            key={`${c.x}-${c.y}`}
            className={`snake-game__cell ${c.type}`}
          />
        ))}
      </div>

      {gameOver && (
        <div className="snake-game__overlay">
          <p>Game Over — Score: {score}</p>
          <button type="button" className="btn" onClick={reset}>
            Play Again
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      )}

      <div className="snake-game__controls">
        <button type="button" className="snake-game__pad" onClick={() => setDirection('up')} aria-label="Up">
          ▲
        </button>
        <div className="snake-game__pad-row">
          <button type="button" className="snake-game__pad" onClick={() => setDirection('left')} aria-label="Left">
            ◀
          </button>
          <button type="button" className="snake-game__pad" onClick={() => setDirection('down')} aria-label="Down">
            ▼
          </button>
          <button type="button" className="snake-game__pad" onClick={() => setDirection('right')} aria-label="Right">
            ▶
          </button>
        </div>
      </div>
    </div>
  )
}
