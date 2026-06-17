import { useRef, useState } from 'react'
import WordSetterSetup from '../../components/WordSetterSetup'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { usePassAndPlayOpening } from '../../lib/turn-order/usePassAndPlayOpening'
import { recordGameEnd } from '../../lib/stats'
import { MAX_WRONG } from './HangmanFigure'
import HangmanLocalBoard from './HangmanLocalBoard'
import {
  formatHangmanRoundLine,
  matchHangmanWinner,
  type HangmanRoundSummary,
} from './hangman-match'
import './Hangman.css'

type Phase =
  | 'set-p1'
  | 'set-p2'
  | 'handoff-p1'
  | 'play-p1'
  | 'handoff-p2'
  | 'play-p2'
  | 'results'

function PassHandoff({
  title,
  body,
  buttonLabel,
  onContinue,
}: {
  title: string
  body: string
  buttonLabel: string
  onContinue: () => void
}) {
  return (
    <div className="hm hm--results">
      <p className="hm__results-headline">{title}</p>
      <p className="hm__results-detail">{body}</p>
      <button type="button" className="btn" onClick={onContinue}>
        {buttonLabel}
      </button>
    </div>
  )
}

export default function HangmanPassAndPlay({ onExit }: { onExit: () => void }) {
  const gameId = 'hangman'
  const { openingPhase, rotateAfterMatch, nextOpeningPhase } = usePassAndPlayOpening(gameId)
  const [phase, setPhase] = useState<Phase>(openingPhase)
  const [secretForP2, setSecretForP2] = useState('')
  const [secretForP1, setSecretForP1] = useState('')
  const [p1Round, setP1Round] = useState<HangmanRoundSummary | null>(null)
  const [p2Round, setP2Round] = useState<HangmanRoundSummary | null>(null)

  const [guessed, setGuessed] = useState<Set<string>>(() => new Set())
  const startTime = useRef(Date.now())

  const victoryHeadline =
    phase === 'results' && p1Round && p2Round
      ? matchHangmanWinner(p1Round, p2Round, 'Player 1', 'Player 2').headline
      : ''
  useVictoryConfetti(victoryHeadline)

  const restart = () => {
    setPhase(nextOpeningPhase())
    setSecretForP2('')
    setSecretForP1('')
    setP1Round(null)
    setP2Round(null)
    setGuessed(new Set())
    startTime.current = Date.now()
  }

  const finishMatch = (r1: HangmanRoundSummary, r2: HangmanRoundSummary) => {
    setP1Round(r1)
    setP2Round(r2)
    setPhase('results')
    const { headline } = matchHangmanWinner(r1, r2, 'Player 1', 'Player 2')
    const result: 'win' | 'loss' | undefined = headline.includes('Player 1')
      ? 'win'
      : headline.includes('Player 2')
        ? 'loss'
        : undefined
    recordGameEnd({
      gameId,
      mode: 'pass-and-play',
      result,
      durationMs: Date.now() - startTime.current,
      startedAt: startTime.current,
    })
    rotateAfterMatch()
  }

  const wrongCount = (answer: string, g: Set<string>) =>
    [...g].filter((ch) => !answer.includes(ch)).length

  const isSolved = (answer: string, g: Set<string>) => answer.split('').every((ch) => g.has(ch))

  if (phase === 'set-p1') {
    return (
      <WordSetterSetup
        key="hm-pap-p1"
        mode="pass-and-play"
        session={null}
        minLen={2}
        maxLen={14}
        hint="Player 1 — pick a word for Player 2 to guess"
        onConfirm={(word) => {
          setSecretForP2(word)
          setPhase('set-p2')
        }}
      />
    )
  }

  if (phase === 'set-p2') {
    return (
      <WordSetterSetup
        key="hm-pap-p2"
        mode="pass-and-play"
        session={null}
        minLen={2}
        maxLen={14}
        hint="Player 2 — pick a word for Player 1 to guess"
        onConfirm={(word) => {
          setSecretForP1(word)
          setPhase('handoff-p1')
        }}
      />
    )
  }

  if (phase === 'handoff-p1') {
    return (
      <PassHandoff
        title="Words are set"
        body="Pass to Player 1 — guess Player 2's word."
        buttonLabel="Player 1 — start"
        onContinue={() => {
          setGuessed(new Set())
          setPhase('play-p1')
        }}
      />
    )
  }

  if (phase === 'play-p1') {
    const wrong = wrongCount(secretForP1, guessed)
    const done = isSolved(secretForP1, guessed) || wrong >= MAX_WRONG
    return (
      <div className="hm">
        <p className="hm__player-tag">Player 1</p>
        <HangmanLocalBoard
          answer={secretForP1}
          guessed={guessed}
          finished={done}
          statusText={
            done && isSolved(secretForP1, guessed)
              ? 'Got it!'
              : done
                ? `The word was ${secretForP1}`
                : `${MAX_WRONG - wrong} wrong guesses left`
          }
          onGuess={(letter) => {
            if (guessed.has(letter) || done) return
            const next = new Set(guessed)
            next.add(letter)
            setGuessed(next)
            const w = wrongCount(secretForP1, next)
            if (isSolved(secretForP1, next) || w >= MAX_WRONG) {
              setP1Round({
                won: isSolved(secretForP1, next),
                wrongCount: w,
                secret: secretForP1,
              })
              setPhase('handoff-p2')
            }
          }}
        />
      </div>
    )
  }

  if (phase === 'handoff-p2' && p1Round) {
    const line = p1Round.won
      ? `Player 1 solved it with ${p1Round.wrongCount} wrong guesses.`
      : `Player 1 didn't solve it.`
    return (
      <PassHandoff
        title="Player 1 is done"
        body={`${line} Pass to Player 2.`}
        buttonLabel="Player 2 — start"
        onContinue={() => {
          setGuessed(new Set())
          setPhase('play-p2')
        }}
      />
    )
  }

  if (phase === 'play-p2') {
    const wrong = wrongCount(secretForP2, guessed)
    const done = isSolved(secretForP2, guessed) || wrong >= MAX_WRONG
    return (
      <div className="hm">
        <p className="hm__player-tag">Player 2</p>
        <HangmanLocalBoard
          answer={secretForP2}
          guessed={guessed}
          finished={done}
          statusText={
            done && isSolved(secretForP2, guessed)
              ? 'Got it!'
              : done
                ? `The word was ${secretForP2}`
                : `${MAX_WRONG - wrong} wrong guesses left`
          }
          onGuess={(letter) => {
            if (guessed.has(letter) || done) return
            const next = new Set(guessed)
            next.add(letter)
            setGuessed(next)
            const w = wrongCount(secretForP2, next)
            if (isSolved(secretForP2, next) || w >= MAX_WRONG) {
              const r2: HangmanRoundSummary = {
                won: isSolved(secretForP2, next),
                wrongCount: w,
                secret: secretForP2,
              }
              if (p1Round) finishMatch(p1Round, r2)
            }
          }}
        />
      </div>
    )
  }

  if (phase === 'results' && p1Round && p2Round) {
    const { headline, detail } = matchHangmanWinner(p1Round, p2Round, 'Player 1', 'Player 2')
    return (
      <div className="hm hm--results">
        <p className="hm__results-headline">{headline}</p>
        <p className="hm__results-detail">{detail}</p>
        <ul className="hm__results-scores">
          <li>{formatHangmanRoundLine('Player 1', p1Round)}</li>
          <li>{formatHangmanRoundLine('Player 2', p2Round)}</li>
        </ul>
        <div className="hm__actions">
          <button type="button" className="btn" onClick={restart}>
            Play again
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      </div>
    )
  }

  return null
}
