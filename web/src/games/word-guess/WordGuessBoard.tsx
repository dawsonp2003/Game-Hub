import { useCallback, useEffect, useMemo, useState } from 'react'
import { scoreWordGuess, type LetterResult } from '../../lib/words'

export const MAX_GUESSES = 6

export const KEYS = [
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

export interface GuessRoundResult {
  won: boolean
  guessCount: number
}

interface WordGuessBoardProps {
  answer: string
  statusHint?: string
  onComplete: (result: GuessRoundResult) => void
}

export default function WordGuessBoard({ answer, statusHint, onComplete }: WordGuessBoardProps) {
  const wordLen = answer.length
  const [guesses, setGuesses] = useState<string[]>([])
  const [results, setResults] = useState<LetterResult[][]>([])
  const [current, setCurrent] = useState('')
  const [message, setMessage] = useState('')
  const [keyStates, setKeyStates] = useState<Record<string, KeyState>>({})
  const [finished, setFinished] = useState(false)

  const rows = useMemo(() => Array.from({ length: MAX_GUESSES }, (_, i) => i), [])
  const cols = useMemo(() => Array.from({ length: wordLen }, (_, i) => i), [wordLen])

  const submitGuess = useCallback(() => {
    const guess = current.toUpperCase()
    if (guess.length !== wordLen) {
      setMessage(`Need ${wordLen} letters`)
      return
    }

    setMessage('')
    const scored = scoreWordGuess(guess, answer)
    const nextGuesses = [...guesses, guess]
    const won = guess === answer
    const lost = !won && nextGuesses.length >= MAX_GUESSES

    setGuesses(nextGuesses)
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
      onComplete({ won, guessCount: nextGuesses.length })
    }
  }, [answer, current, guesses, onComplete, wordLen])

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

  const statusText = () => {
    if (finished && guesses[guesses.length - 1] === answer) return 'Got it!'
    if (finished) return `The word was ${answer}`
    return message || statusHint || 'Guess the word'
  }

  return (
    <>
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
    </>
  )
}
