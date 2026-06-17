import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { recordGameEnd } from '../../lib/stats'
import {
  isValidFiveLetterGuess,
  pickRandomFiveLetterWord,
  scoreWordGuess,
  type LetterResult,
} from '../../lib/words'
import { KEYS, MAX_GUESSES } from './WordGuessBoard'
import WordGuessPassAndPlay from './WordGuessPassAndPlay'
import WordGuessRemote from './WordGuessRemote'
import WordGuessAsync from './WordGuessAsync'
import './WordGuess.css'

const DEFAULT_LEN = 5

type KeyState = LetterResult | 'unused'

function mergeKeyState(prev: KeyState, next: LetterResult): KeyState {
  if (prev === 'correct' || next === 'correct') return 'correct'
  if (prev === 'present' || next === 'present') return 'present'
  if (prev === 'absent' || next === 'absent') return 'absent'
  return 'unused'
}

export default function WordGuess({
  mode,
  session,
  peerAway = false,
  asyncMatchId,
  initialCheckpoint: _initialCheckpoint,
  onCheckpointClear,
  onExit,
}: GameProps) {
  if (mode === 'pass-and-play') {
    return <WordGuessPassAndPlay onExit={onExit} />
  }

  if (mode === 'async') {
    return (
      <WordGuessAsync
        session={session}
        asyncMatchId={asyncMatchId}
        onExit={onExit}
        onCheckpointClear={onCheckpointClear}
      />
    )
  }

  if (mode === 'remote') {
    return <WordGuessRemote session={session} peerAway={peerAway} onExit={onExit} />
  }

  const [answer, setAnswer] = useState(() => pickRandomFiveLetterWord())
  const [guesses, setGuesses] = useState<string[]>([])
  const [results, setResults] = useState<LetterResult[][]>([])
  const [current, setCurrent] = useState('')
  const [message, setMessage] = useState('')
  const [keyStates, setKeyStates] = useState<Record<string, KeyState>>({})
  const [finished, setFinished] = useState(false)
  const [won, setWon] = useState(false)
  const startTime = useRef(Date.now())
  const gameId = 'word-guess'

  useVictoryConfetti(finished && won)

  const [wordLen] = useState(DEFAULT_LEN)
  const rows = useMemo(() => Array.from({ length: MAX_GUESSES }, (_, i) => i), [])
  const cols = useMemo(() => Array.from({ length: wordLen }, (_, i) => i), [wordLen])
  const requireDict = wordLen === DEFAULT_LEN

  const submitGuess = useCallback(() => {
    const guess = current.toUpperCase()
    if (guess.length !== wordLen) {
      setMessage(`Need ${wordLen} letters`)
      return
    }
    if (requireDict && !isValidFiveLetterGuess(guess)) {
      setMessage('Not in word list')
      return
    }

    setMessage('')
    const scored = scoreWordGuess(guess, answer)
    const won = guess === answer
    const lost = !won && guesses.length + 1 >= MAX_GUESSES

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

    if (won || lost) {
      setFinished(true)
      setWon(won)
      const turns = guesses.length + 1
      recordGameEnd({
        gameId,
        mode,
        result: won ? 'win' : 'loss',
        score: won ? MAX_GUESSES - guesses.length : undefined,
        turns,
        durationMs: Date.now() - startTime.current,
        startedAt: startTime.current,
      })
    }
  }, [answer, current, guesses.length, requireDict, wordLen, mode])

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
      if (key.length === 1 && /[A-Z]/i.test(key) && current.length < wordLen) {
        setCurrent((c) => (c + key).toUpperCase())
        setMessage('')
      }
    },
    [current.length, finished, submitGuess, wordLen],
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

  const newGame = () => {
    setAnswer(pickRandomFiveLetterWord())
    setGuesses([])
    setResults([])
    setCurrent('')
    setMessage('')
    setKeyStates({})
    setFinished(false)
    setWon(false)
    startTime.current = Date.now()
  }

  const statusText = () => {
    if (finished && guesses[guesses.length - 1] === answer) return 'You got it!'
    if (finished) return `The word was ${answer}`
    return message || 'Guess the 5-letter word'
  }

  return (
    <div className="wg">
      <p className="wg__status">{statusText()}</p>

      <div
        className="wg__grid"
        role="grid"
        aria-label="Guesses"
        style={{ '--wg-cols': wordLen } as React.CSSProperties}
      >
        {rows.map((row) => (
          <div key={row} className="wg__row" role="row">
            {cols.map((col) => {
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

      {!finished && (
        <div className="wg__keyboard" role="group" aria-label="Keyboard">
          {KEYS.map((row, i) => (
            <div key={i} className="wg__kb-row">
              {row.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`wg__key ${keyStates[key] ?? ''} ${key.length > 1 ? 'wide' : ''}`}
                  onClick={() => onKey(key === '⌫' ? '⌫' : key === 'ENTER' ? 'ENTER' : key)}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

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
