import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LetterResult } from '../../lib/words'
import { KEYS, MAX_GUESSES } from './WordGuessBoard'

type KeyState = LetterResult | 'unused'

function mergeKeyState(prev: KeyState, next: LetterResult): KeyState {
  if (prev === 'correct' || next === 'correct') return 'correct'
  if (prev === 'present' || next === 'present') return 'present'
  if (prev === 'absent' || next === 'absent') return 'absent'
  return 'unused'
}

interface WordGuessPeerBoardProps {
  wordLen: number
  guesses: string[]
  results: LetterResult[][]
  finished: boolean
  statusHint?: string
  revealedAnswer?: string | null
  disabled?: boolean
  onSubmitGuess: (guess: string) => void
}

export default function WordGuessPeerBoard({
  wordLen,
  guesses,
  results,
  finished,
  statusHint,
  revealedAnswer,
  disabled = false,
  onSubmitGuess,
}: WordGuessPeerBoardProps) {
  const [current, setCurrent] = useState('')
  const [message, setMessage] = useState('')
  const [keyStates, setKeyStates] = useState<Record<string, KeyState>>({})

  const rows = useMemo(() => Array.from({ length: MAX_GUESSES }, (_, i) => i), [])
  const cols = useMemo(() => Array.from({ length: wordLen }, (_, i) => i), [wordLen])

  useEffect(() => {
    if (results.length === 0) return
    const last = results[results.length - 1]!
    const guess = guesses[guesses.length - 1]!
    setKeyStates((prev) => {
      const next = { ...prev }
      for (let i = 0; i < guess.length; i++) {
        const ch = guess[i]!
        next[ch] = mergeKeyState(prev[ch] ?? 'unused', last[i]!)
      }
      return next
    })
  }, [guesses, results])

  const submitGuess = useCallback(() => {
    const guess = current.toUpperCase()
    if (guess.length !== wordLen) {
      setMessage(`Need ${wordLen} letters`)
      return
    }
    setMessage('')
    onSubmitGuess(guess)
    setCurrent('')
  }, [current, onSubmitGuess, wordLen])

  const onKey = useCallback(
    (key: string) => {
      if (finished || disabled) return
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
    [current.length, disabled, finished, submitGuess, wordLen],
  )

  useEffect(() => {
    if (finished || disabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') onKey('ENTER')
      else if (e.key === 'Backspace') onKey('⌫')
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toUpperCase())
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [disabled, finished, onKey])

  const statusText = () => {
    if (finished && revealedAnswer && guesses[guesses.length - 1] === revealedAnswer) return 'Got it!'
    if (finished && revealedAnswer) return `The word was ${revealedAnswer}`
    if (finished) return statusHint ?? 'Round over'
    return message || statusHint || "Guess your friend's word"
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
              const isActive = row === guesses.length && !finished && !disabled
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

      {!finished && !disabled && (
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
