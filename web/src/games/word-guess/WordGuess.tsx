import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { stats } from '../../lib/stats'
import {
  isValidFiveLetterGuess,
  pickRandomFiveLetterWord,
  scoreWordGuess,
  type LetterResult,
} from '../../lib/words'
import './WordGuess.css'

const MAX_GUESSES = 6
const WORD_LEN = 5
const ROWS = Array.from({ length: MAX_GUESSES }, (_, i) => i)
const COLS = Array.from({ length: WORD_LEN }, (_, i) => i)
const KEYS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
]

type KeyState = LetterResult | 'unused'

function mergeKeyState(prev: KeyState, next: LetterResult): KeyState {
  if (prev === 'correct' || next === 'correct') return 'correct'
  if (prev === 'present' || next === 'present') return 'present'
  if (prev === 'absent' || next === 'absent') return 'absent'
  return 'unused'
}

export default function WordGuess({ onExit }: GameProps) {
  const [answer, setAnswer] = useState(() => pickRandomFiveLetterWord())
  const [guesses, setGuesses] = useState<string[]>([])
  const [results, setResults] = useState<LetterResult[][]>([])
  const [current, setCurrent] = useState('')
  const [message, setMessage] = useState('')
  const [keyStates, setKeyStates] = useState<Record<string, KeyState>>({})
  const [finished, setFinished] = useState(false)
  const startTime = useRef(Date.now())
  const gameId = 'word-guess'

  const newGame = () => {
    setAnswer(pickRandomFiveLetterWord())
    setGuesses([])
    setResults([])
    setCurrent('')
    setMessage('')
    setKeyStates({})
    setFinished(false)
    startTime.current = Date.now()
  }

  const submitGuess = useCallback(() => {
    const guess = current.toUpperCase()
    if (guess.length !== WORD_LEN) {
      setMessage('Need 5 letters')
      return
    }
    if (!isValidFiveLetterGuess(guess)) {
      setMessage('Not in word list')
      return
    }

    setMessage('')
    const scored = scoreWordGuess(guess, answer)
    setGuesses((g) => [...g, guess])
    setResults((r) => [...r, scored])
    setCurrent('')

    setKeyStates((prev) => {
      const next = { ...prev }
      for (let i = 0; i < guess.length; i++) {
        const ch = guess[i]!
        next[ch] = mergeKeyState(prev[ch] ?? 'unused', scored[i]!)
      }
      return next
    })

    if (guess === answer) {
      setFinished(true)
      stats.recordPlay(gameId, Date.now() - startTime.current)
      stats.recordResult(gameId, 'win')
      stats.recordScore(gameId, MAX_GUESSES - guesses.length)
      return
    }

    if (guesses.length + 1 >= MAX_GUESSES) {
      setFinished(true)
      stats.recordPlay(gameId, Date.now() - startTime.current)
      stats.recordResult(gameId, 'loss')
    }
  }, [answer, current, guesses.length])

  const onKey = useCallback(
    (key: string) => {
      if (finished) return
      if (key === 'ENTER') {
        submitGuess()
        return
      }
      if (key === '⌫' || key === 'BACKSPACE') {
        setCurrent((c) => c.slice(0, -1))
        setMessage('')
        return
      }
      if (key.length === 1 && /[A-Z]/i.test(key) && current.length < WORD_LEN) {
        setCurrent((c) => (c + key).toUpperCase())
        setMessage('')
      }
    },
    [current.length, finished, submitGuess],
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') onKey('ENTER')
      else if (e.key === 'Backspace') onKey('⌫')
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toUpperCase())
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onKey])

  const statusText = () => {
    if (finished && guesses[guesses.length - 1] === answer) return 'You got it!'
    if (finished) return `The word was ${answer}`
    return message || 'Guess the 5-letter word'
  }

  return (
    <div className="wg">
      <p className="wg__status">{statusText()}</p>

      <div className="wg__grid" role="grid" aria-label="Guesses">
        {ROWS.map((row) => (
          <div key={row} className="wg__row" role="row">
            {COLS.map((col) => {
              const isActive = row === guesses.length && !finished
              const letter =
                row < guesses.length
                  ? guesses[row]![col]
                  : isActive
                    ? current[col] ?? ''
                    : ''
              const state = row < guesses.length ? results[row]![col] : undefined
              return (
                <div
                  key={col}
                  className={`wg__tile ${state ?? ''} ${isActive && letter ? 'filled' : ''}`}
                  role="gridcell"
                >
                  {letter}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="wg__keyboard" role="group" aria-label="Keyboard">
        {KEYS.map((row, i) => (
          <div key={i} className="wg__kb-row">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                className={`wg__key ${keyStates[key] ?? ''} ${key.length > 1 ? 'wide' : ''}`}
                onClick={() => onKey(key === '⌫' ? '⌫' : key === 'ENTER' ? 'ENTER' : key)}
                disabled={finished && key !== 'ENTER'}
              >
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>

      {finished && (
        <div className="wg__actions">
          <button type="button" className="btn" onClick={newGame}>
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
