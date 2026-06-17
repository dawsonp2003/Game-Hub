import { useCallback, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { recordGameEnd } from '../../lib/stats'
import { pickRandomHangmanWord } from '../../lib/words'
import HangmanLocalBoard, { MAX_WRONG } from './HangmanLocalBoard'
import HangmanPassAndPlay from './HangmanPassAndPlay'
import HangmanRemote from './HangmanRemote'
import HangmanAsync from './HangmanAsync'
import './Hangman.css'

export default function Hangman({
  mode,
  session,
  peerAway = false,
  asyncMatchId,
  onCheckpointClear,
  onExit,
}: GameProps) {
  if (mode === 'pass-and-play') {
    return <HangmanPassAndPlay onExit={onExit} />
  }

  if (mode === 'async') {
    return (
      <HangmanAsync
        session={session}
        asyncMatchId={asyncMatchId}
        onExit={onExit}
        onCheckpointClear={onCheckpointClear}
      />
    )
  }

  if (mode === 'remote') {
    return <HangmanRemote session={session} peerAway={peerAway} onExit={onExit} />
  }

  const [answer, setAnswer] = useState(() => pickRandomHangmanWord())
  const [guessed, setGuessed] = useState<Set<string>>(() => new Set())
  const startTime = useRef(Date.now())
  const gameId = 'hangman'

  const wrongCount = [...guessed].filter((ch) => !answer.includes(ch)).length
  const won = answer.split('').every((ch) => guessed.has(ch))
  const lost = wrongCount >= MAX_WRONG
  const finished = won || lost

  useVictoryConfetti(finished && won)

  const guess = useCallback(
    (letter: string) => {
      if (finished || guessed.has(letter)) return
      const next = new Set(guessed)
      next.add(letter)
      setGuessed(next)

      const newWrong = [...next].filter((ch) => !answer.includes(ch)).length
      const solved = answer.split('').every((ch) => next.has(ch))

      if (solved || newWrong >= MAX_WRONG) {
        recordGameEnd({
          gameId,
          mode,
          result: solved ? 'win' : 'loss',
          score: solved ? MAX_WRONG - newWrong : undefined,
          turns: next.size,
          durationMs: Date.now() - startTime.current,
          startedAt: startTime.current,
        })
      }
    },
    [answer, finished, guessed, mode],
  )

  const newGame = () => {
    setAnswer(pickRandomHangmanWord())
    setGuessed(new Set())
    startTime.current = Date.now()
  }

  const statusText = () => {
    if (won) return 'You saved them!'
    if (lost) return `The word was ${answer}`
    return `${MAX_WRONG - wrongCount} wrong guesses left`
  }

  return (
    <div className="hm">
      <HangmanLocalBoard
        answer={answer}
        guessed={guessed}
        finished={finished}
        onGuess={guess}
        statusText={statusText()}
      />

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
