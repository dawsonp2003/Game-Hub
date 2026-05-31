import { useCallback, useMemo, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { stats } from '../../lib/stats'
import { pickRandomHangmanWord } from '../../lib/words'
import './Hangman.css'

const MAX_WRONG = 6
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function Hangman({ onExit }: GameProps) {
  const [answer, setAnswer] = useState(() => pickRandomHangmanWord())
  const [guessed, setGuessed] = useState<Set<string>>(() => new Set())
  const [message, setMessage] = useState('')
  const startTime = useRef(Date.now())
  const gameId = 'hangman'

  const wrongCount = useMemo(
    () => [...guessed].filter((ch) => !answer.includes(ch)).length,
    [guessed, answer],
  )

  const won = useMemo(
    () => answer.split('').every((ch) => guessed.has(ch)),
    [answer, guessed],
  )
  const lost = wrongCount >= MAX_WRONG
  const finished = won || lost

  const displayWord = answer
    .split('')
    .map((ch) => (guessed.has(ch) || finished ? ch : '_'))
    .join(' ')

  const guess = useCallback(
    (letter: string) => {
      if (finished || guessed.has(letter)) return
      setMessage('')
      const next = new Set(guessed)
      next.add(letter)
      setGuessed(next)

      const newWrong = [...next].filter((ch) => !answer.includes(ch)).length
      const solved = answer.split('').every((ch) => next.has(ch))

      if (solved) {
        stats.recordPlay(gameId, Date.now() - startTime.current)
        stats.recordResult(gameId, 'win')
        stats.recordScore(gameId, MAX_WRONG - newWrong)
      } else if (newWrong >= MAX_WRONG) {
        stats.recordPlay(gameId, Date.now() - startTime.current)
        stats.recordResult(gameId, 'loss')
      }
    },
    [answer, finished, guessed],
  )

  const newGame = () => {
    setAnswer(pickRandomHangmanWord())
    setGuessed(new Set())
    setMessage('')
    startTime.current = Date.now()
  }

  const statusText = () => {
    if (won) return 'You saved them!'
    if (lost) return `The word was ${answer}`
    return `${MAX_WRONG - wrongCount} wrong guesses left`
  }

  return (
    <div className="hm">
      <div className="hm__figure" aria-hidden>
        <svg viewBox="0 0 120 140" className="hm__svg">
          <line x1="10" y1="130" x2="110" y2="130" stroke="currentColor" strokeWidth="3" />
          <line x1="30" y1="130" x2="30" y2="20" stroke="currentColor" strokeWidth="3" />
          <line x1="30" y1="20" x2="80" y2="20" stroke="currentColor" strokeWidth="3" />
          <line x1="80" y1="20" x2="80" y2="35" stroke="currentColor" strokeWidth="3" />
          {wrongCount > 0 && <circle cx="80" cy="45" r="10" stroke="currentColor" strokeWidth="3" fill="none" />}
          {wrongCount > 1 && <line x1="80" y1="55" x2="80" y2="90" stroke="currentColor" strokeWidth="3" />}
          {wrongCount > 2 && <line x1="80" y1="65" x2="65" y2="80" stroke="currentColor" strokeWidth="3" />}
          {wrongCount > 3 && <line x1="80" y1="65" x2="95" y2="80" stroke="currentColor" strokeWidth="3" />}
          {wrongCount > 4 && <line x1="80" y1="90" x2="65" y2="115" stroke="currentColor" strokeWidth="3" />}
          {wrongCount > 5 && <line x1="80" y1="90" x2="95" y2="115" stroke="currentColor" strokeWidth="3" />}
        </svg>
      </div>

      <p className="hm__status">{statusText()}</p>
      <p className="hm__word" aria-label="Word progress">
        {displayWord}
      </p>

      <div className="hm__keyboard" role="group" aria-label="Letter keys">
        {ALPHABET.map((letter) => {
          const used = guessed.has(letter)
          const correct = used && answer.includes(letter)
          const wrong = used && !answer.includes(letter)
          return (
            <button
              key={letter}
              type="button"
              className={`hm__key ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}`}
              onClick={() => guess(letter)}
              disabled={finished || used}
            >
              {letter}
            </button>
          )
        })}
      </div>

      {message && <p className="hm__message">{message}</p>}

      {finished && (
        <div className="hm__actions">
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
