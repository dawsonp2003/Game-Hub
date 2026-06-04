import { useCallback, useMemo, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { recordGameEnd } from '../../lib/stats'
import { pickRandomAnagramWord, pickWordFindPuzzle, shuffle, type WordFindPuzzle } from '../../lib/words'
import './Anagram.css'

type Tab = 'scramble' | 'find'
type Point = { r: number; c: number }

function pointsEqual(a: Point, b: Point): boolean {
  return a.r === b.r && a.c === b.c
}

function isAdjacent(a: Point, b: Point): boolean {
  return Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1 && !pointsEqual(a, b)
}

function selectionWord(grid: string[][], path: Point[]): string {
  return path.map((p) => grid[p.r]![p.c]).join('')
}

function pathLinePoints(path: Point[], cols: number): string {
  if (path.length < 2) return ''
  const step = 100 / cols
  return path
    .map((p) => `${(p.c + 0.5) * step},${(p.r + 0.5) * step}`)
    .join(' ')
}

export default function Anagram({ onExit }: GameProps) {
  const [tab, setTab] = useState<Tab>('scramble')

  return (
    <div className="anag">
      <div className="anag__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`anag__tab ${tab === 'scramble' ? 'active' : ''}`}
          onClick={() => setTab('scramble')}
          aria-selected={tab === 'scramble'}
        >
          Scramble
        </button>
        <button
          type="button"
          role="tab"
          className={`anag__tab ${tab === 'find' ? 'active' : ''}`}
          onClick={() => setTab('find')}
          aria-selected={tab === 'find'}
        >
          Word Find
        </button>
      </div>

      {tab === 'scramble' ? <ScrambleMode onExit={onExit} /> : <WordFindMode onExit={onExit} />}
    </div>
  )
}

function ScrambleMode({ onExit }: { onExit: () => void }) {
  const [answer, setAnswer] = useState(() => pickRandomAnagramWord())
  const [scrambled, setScrambled] = useState(() => shuffle(answer.split('')).join(''))
  const [guess, setGuess] = useState('')
  const [message, setMessage] = useState('')
  const [won, setWon] = useState(false)
  const startTime = useRef(Date.now())
  const gameId = 'anagram'

  const check = () => {
    if (guess.toUpperCase() === answer) {
      setWon(true)
      setMessage('Correct!')
      recordGameEnd({
        gameId,
        mode: 'solo',
        result: 'win',
        durationMs: Date.now() - startTime.current,
        startedAt: startTime.current,
      })
    } else {
      setMessage('Not quite — try again')
    }
  }

  const newWord = () => {
    const next = pickRandomAnagramWord()
    setAnswer(next)
    setScrambled(shuffle(next.split('')).join(''))
    setGuess('')
    setMessage('')
    setWon(false)
    startTime.current = Date.now()
  }

  return (
    <div className="anag__panel">
      <p className="anag__hint">Unscramble the letters</p>
      <p className="anag__letters" aria-label="Scrambled letters">
        {scrambled.split('').join(' ')}
      </p>
      <input
        className="input anag__input"
        value={guess}
        onChange={(e) => setGuess(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && !won && check()}
        placeholder="Your guess"
        disabled={won}
        autoCapitalize="characters"
        spellCheck={false}
      />
      {message && <p className={`anag__message ${won ? 'ok' : ''}`}>{message}</p>}
      {!won ? (
        <button type="button" className="btn anag__btn" onClick={check}>
          Check
        </button>
      ) : (
        <div className="anag__actions">
          <button type="button" className="btn" onClick={newWord}>
            New Word
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      )}
    </div>
  )
}

function WordFindMode({ onExit }: { onExit: () => void }) {
  const [puzzle, setPuzzle] = useState<WordFindPuzzle>(() => pickWordFindPuzzle())
  const [found, setFound] = useState<string[]>([])
  const [path, setPath] = useState<Point[]>([])
  const [message, setMessage] = useState('')
  const startTime = useRef(Date.now())
  const gameId = 'anagram'

  const allFound = found.length === puzzle.words.length
  const gridSize = puzzle.grid.length

  const toggleCell = useCallback(
    (r: number, c: number) => {
      if (allFound) return
      const point = { r, c }
      const last = path[path.length - 1]

      if (path.length === 0) {
        setPath([point])
        setMessage('')
        return
      }

      if (pointsEqual(point, last!)) {
        setPath((p) => p.slice(0, -1))
        return
      }

      if (path.some((p) => pointsEqual(p, point))) return
      if (!isAdjacent(last!, point)) {
        setPath([point])
        return
      }

      setPath((p) => [...p, point])
    },
    [path, allFound],
  )

  const submitSelection = useCallback(() => {
    const word = selectionWord(puzzle.grid, path)
    if (word.length < 3) {
      setMessage('Select at least 3 letters')
      return
    }
    if (found.includes(word)) {
      setMessage('Already found')
      setPath([])
      return
    }
    if (!puzzle.words.includes(word)) {
      setMessage('Not a hidden word')
      setPath([])
      return
    }

    const nextFound = [...found, word]
    setFound(nextFound)
    setPath([])
    setMessage(`Found ${word}!`)

    if (nextFound.length === puzzle.words.length) {
      recordGameEnd({
        gameId,
        mode: 'solo',
        result: 'win',
        score: nextFound.length,
        durationMs: Date.now() - startTime.current,
        startedAt: startTime.current,
      })
    }
  }, [puzzle, path, found])

  const newGrid = () => {
    setPuzzle(pickWordFindPuzzle())
    setFound([])
    setPath([])
    setMessage('')
    startTime.current = Date.now()
  }

  const pathSet = useMemo(() => new Set(path.map((p) => `${p.r},${p.c}`)), [path])
  const linePoints = pathLinePoints(path, gridSize)

  return (
    <div className="anag__panel">
      <p className="anag__hint">Tap letters in order — lines show your path</p>

      <ul className="anag__word-list">
        {puzzle.words.map((word) => (
          <li key={word} className={found.includes(word) ? 'found' : ''}>
            {found.includes(word) ? word : '•'.repeat(word.length)}
          </li>
        ))}
      </ul>

      <div className="anag__grid-wrap">
        {linePoints && (
          <svg className="anag__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline
              points={linePoints}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        <div className="anag__grid" role="grid" style={{ '--anag-cols': gridSize } as React.CSSProperties}>
          {puzzle.grid.map((row, r) =>
            row.map((letter, c) => (
              <button
                key={`${r}-${c}`}
                type="button"
                className={`anag__cell ${pathSet.has(`${r},${c}`) ? 'selected' : ''}`}
                onClick={() => toggleCell(r, c)}
                disabled={allFound}
              >
                {letter}
              </button>
            )),
          )}
        </div>
      </div>

      {message && <p className={`anag__message ${allFound ? 'ok' : ''}`}>{message}</p>}

      {!allFound && (
        <button type="button" className="btn anag__btn" onClick={submitSelection} disabled={path.length < 3}>
          Submit word
        </button>
      )}

      {allFound && (
        <div className="anag__actions">
          <button type="button" className="btn" onClick={newGrid}>
            New Grid
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      )}
    </div>
  )
}
