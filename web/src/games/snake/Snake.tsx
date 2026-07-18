import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsMobileViewport } from '../../hooks/usePinchPanZoom'
import type { GameProps } from '../types'
import { recordGameEnd, stats } from '../../lib/stats'
import SnakeJoystick from './SnakeJoystick'
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
  const isMobile = useIsMobileViewport()
  const [snake, setSnake] = useState<Point[]>([
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
  ])
  const [food, setFood] = useState<Point>(() => ({ x: 12, y: 8 }))
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [paused, setPaused] = useState(false)
  const [started, setStarted] = useState(false)
  const dirRef = useRef<Dir>('right')
  /** Queued heading applied once at the start of each tick. */
  const nextDirRef = useRef<Dir>('right')
  const snakeRef = useRef(snake)
  const scoreRef = useRef(0)
  const startTime = useRef(0)
  const gameId = 'snake'

  snakeRef.current = snake
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
    if (!started || gameOver || paused) return

    dirRef.current = nextDirRef.current

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
  }, [food, started, gameOver, paused, endGame])

  useEffect(() => {
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [tick])

  const setDirection = useCallback((d: Dir) => {
    const travel = dirRef.current
    if (OPPOSITE[travel] === d) return false

    const head = snakeRef.current[0]
    const neck = snakeRef.current[1]
    if (head && neck) {
      const delta = DIR_DELTA[d]
      if (head.x + delta.x === neck.x && head.y + delta.y === neck.y) return false
    }

    nextDirRef.current = d
    return true
  }, [])

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
      if (e.key === ' ') {
        e.preventDefault()
        if (e.repeat) return
        if (!started && !gameOver) {
          startTime.current = Date.now()
          setStarted(true)
        } else if (started && !gameOver) {
          setPaused((p) => !p)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setDirection, started, gameOver])

  const reset = (startImmediately = false) => {
    setSnake([
      { x: 8, y: 8 },
      { x: 7, y: 8 },
      { x: 6, y: 8 },
    ])
    setFood({ x: 12, y: 8 })
    dirRef.current = 'right'
    nextDirRef.current = 'right'
    setScore(0)
    setGameOver(false)
    setPaused(false)
    setStarted(startImmediately)
    startTime.current = startImmediately ? Date.now() : 0
  }

  const startGame = () => {
    startTime.current = Date.now()
    setPaused(false)
    setStarted(true)
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
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setPaused((p) => !p)}
          disabled={!started || gameOver}
        >
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

      {!started && !gameOver && (
        <div className="snake-game__overlay">
          <h2 className="snake-game__overlay-title">Ready to play?</h2>
          <p className="snake-game__overlay-text">
            Use arrow keys or WASD to steer. On mobile, use the joystick.
          </p>
          <button type="button" className="btn" onClick={startGame} autoFocus>
            Start Game
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      )}

      {gameOver && (
        <div className="snake-game__overlay">
          <p>Game Over — Score: {score}</p>
          <button type="button" className="btn" onClick={() => reset(true)}>
            Play Again
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      )}

      {isMobile ? (
        <SnakeJoystick onDirection={setDirection} disabled={!started || gameOver || paused} />
      ) : (
        <div className="snake-game__controls">
          <button
            type="button"
            className="snake-game__pad"
            onClick={() => setDirection('up')}
            aria-label="Up"
            disabled={!started || gameOver || paused}
          >
            ▲
          </button>
          <div className="snake-game__pad-row">
            <button
              type="button"
              className="snake-game__pad"
              onClick={() => setDirection('left')}
              aria-label="Left"
              disabled={!started || gameOver || paused}
            >
              ◀
            </button>
            <button
              type="button"
              className="snake-game__pad"
              onClick={() => setDirection('down')}
              aria-label="Down"
              disabled={!started || gameOver || paused}
            >
              ▼
            </button>
            <button
              type="button"
              className="snake-game__pad"
              onClick={() => setDirection('right')}
              aria-label="Right"
              disabled={!started || gameOver || paused}
            >
              ▶
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
