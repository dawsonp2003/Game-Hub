import { useMemo } from 'react'
import HangmanFigure, { MAX_WRONG } from './HangmanFigure'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

interface HangmanLocalBoardProps {
  answer: string
  guessed: Set<string>
  finished: boolean
  onGuess: (letter: string) => void
  statusText: string
}

export default function HangmanLocalBoard({
  answer,
  guessed,
  finished,
  onGuess,
  statusText,
}: HangmanLocalBoardProps) {
  const wrongCount = useMemo(
    () => [...guessed].filter((ch) => !answer.includes(ch)).length,
    [guessed, answer],
  )

  const displayWord = answer
    .split('')
    .map((ch) => (guessed.has(ch) || finished ? ch : '_'))
    .join(' ')

  return (
    <>
      <HangmanFigure wrongCount={wrongCount} />
      <p className="hm__status">{statusText}</p>
      <p className="hm__word" aria-label="Word progress">
        {displayWord}
      </p>
      {!finished && (
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

export { MAX_WRONG, ALPHABET }
