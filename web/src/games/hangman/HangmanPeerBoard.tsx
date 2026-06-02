import { useMemo } from 'react'
import HangmanFigure, { MAX_WRONG } from './HangmanFigure'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

interface HangmanPeerBoardProps {
  display: string
  guessed: string[]
  wrongCount: number
  finished: boolean
  revealedAnswer?: string | null
  disabled?: boolean
  statusHint?: string
  onGuess: (letter: string) => void
}

function letterIsCorrect(letter: string, display: string): boolean {
  return display.replace(/\s/g, '').includes(letter)
}

export default function HangmanPeerBoard({
  display,
  guessed,
  wrongCount,
  finished,
  revealedAnswer,
  disabled = false,
  statusHint,
  onGuess,
}: HangmanPeerBoardProps) {
  const guessedSet = useMemo(() => new Set(guessed), [guessed])

  const statusText = () => {
    if (finished && revealedAnswer && !display.includes('_')) {
      return 'You saved them!'
    }
    if (finished && revealedAnswer) return `The word was ${revealedAnswer}`
    if (finished) return statusHint ?? 'Round over'
    return statusHint ?? `${MAX_WRONG - wrongCount} wrong guesses left`
  }

  return (
    <>
      <HangmanFigure wrongCount={wrongCount} />
      <p className="hm__status">{statusText()}</p>
      <p className="hm__word" aria-label="Word progress">
        {display || '—'}
      </p>
      {!finished && !disabled && (
        <div className="hm__keyboard" role="group" aria-label="Letter keys">
          {ALPHABET.map((letter) => {
            const used = guessedSet.has(letter)
            const correct = used && letterIsCorrect(letter, display)
            const wrong = used && !correct
            return (
              <button
                key={letter}
                type="button"
                className={`hm__key ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}`}
                onClick={() => onGuess(letter)}
                disabled={used}
              >
                {letter}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
