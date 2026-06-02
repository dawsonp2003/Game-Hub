import { useRef, useState } from 'react'
import WordSetterSetup from '../../components/WordSetterSetup'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { stats } from '../../lib/stats'
import WordGuessBoard, { type GuessRoundResult } from './WordGuessBoard'
import { formatRoundLine, matchWinner, type RoundSummary } from './word-guess-match'
import './WordGuess.css'

type Phase =
  | 'set-p1'
  | 'set-p2'
  | 'handoff-guess-p1'
  | 'guess-p1'
  | 'handoff-guess-p2'
  | 'guess-p2'
  | 'results'

function toRoundSummary(result: GuessRoundResult, secret: string): RoundSummary {
  return { ...result, secret }
}

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
    <div className="wg wg--pap">
      <p className="wg__pap-title">{title}</p>
      <p className="wg__pap-body">{body}</p>
      <button type="button" className="btn wg__pap-btn" onClick={onContinue}>
        {buttonLabel}
      </button>
    </div>
  )
}

export default function WordGuessPassAndPlay({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('set-p1')
  /** Word Player 2 must guess (chosen by Player 1). */
  const [secretForP2, setSecretForP2] = useState('')
  /** Word Player 1 must guess (chosen by Player 2). */
  const [secretForP1, setSecretForP1] = useState('')
  const [p1Round, setP1Round] = useState<RoundSummary | null>(null)
  const [p2Round, setP2Round] = useState<RoundSummary | null>(null)
  const startTime = useRef(Date.now())
  const gameId = 'word-guess'

  const victoryHeadline =
    phase === 'results' && p1Round && p2Round
      ? matchWinner(p1Round, p2Round, 'Player 1', 'Player 2').headline
      : ''
  useVictoryConfetti(victoryHeadline)

  const restart = () => {
    setPhase('set-p1')
    setSecretForP2('')
    setSecretForP1('')
    setP1Round(null)
    setP2Round(null)
    startTime.current = Date.now()
  }

  const finishMatch = (r1: RoundSummary, r2: RoundSummary) => {
    setP1Round(r1)
    setP2Round(r2)
    setPhase('results')
    stats.recordPlay(gameId, Date.now() - startTime.current)
    const { headline } = matchWinner(r1, r2, 'Player 1', 'Player 2')
    if (headline.includes('Player 1')) stats.recordResult(gameId, 'win')
    else if (headline.includes('Player 2')) stats.recordResult(gameId, 'loss')
  }

  if (phase === 'set-p1') {
    return (
      <WordSetterSetup
        key="pap-set-p1"
        mode="pass-and-play"
        session={null}
        minLen={2}
        maxLen={12}
        hint="Player 1 — pick a word for Player 2 to guess"
        placeholder="Your secret word"
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
        key="pap-set-p2"
        mode="pass-and-play"
        session={null}
        minLen={2}
        maxLen={12}
        hint="Player 2 — pick a word for Player 1 to guess"
        placeholder="Your secret word"
        onConfirm={(word) => {
          setSecretForP1(word)
          setPhase('handoff-guess-p1')
        }}
      />
    )
  }

  if (phase === 'handoff-guess-p1') {
    return (
      <PassHandoff
        title="Words are set"
        body="Pass the device to Player 1. They will try to guess Player 2's word."
        buttonLabel="Player 1 — start guessing"
        onContinue={() => setPhase('guess-p1')}
      />
    )
  }

  if (phase === 'guess-p1') {
    return (
      <div className="wg">
        <p className="wg__player-tag">Player 1</p>
        <WordGuessBoard
          answer={secretForP1}
          statusHint="Guess Player 2's word"
          onComplete={(result) => {
            const summary = toRoundSummary(result, secretForP1)
            setP1Round(summary)
            setPhase('handoff-guess-p2')
          }}
        />
      </div>
    )
  }

  if (phase === 'handoff-guess-p2' && p1Round) {
    const p1Done = p1Round.won
      ? `Player 1 got it in ${p1Round.guessCount} guesses.`
      : `Player 1 didn't solve it.`
    return (
      <PassHandoff
        title="Player 1 is done"
        body={`${p1Done} Pass the device to Player 2 to guess Player 1's word.`}
        buttonLabel="Player 2 — start guessing"
        onContinue={() => setPhase('guess-p2')}
      />
    )
  }

  if (phase === 'guess-p2') {
    return (
      <div className="wg">
        <p className="wg__player-tag">Player 2</p>
        <WordGuessBoard
          answer={secretForP2}
          statusHint="Guess Player 1's word"
          onComplete={(result) => {
            const summary = toRoundSummary(result, secretForP2)
            if (p1Round) finishMatch(p1Round, summary)
          }}
        />
      </div>
    )
  }

  if (phase === 'results' && p1Round && p2Round) {
    const { headline, detail } = matchWinner(p1Round, p2Round, 'Player 1', 'Player 2')
    return (
      <div className="wg wg--pap">
        <p className="wg__pap-headline">{headline}</p>
        <p className="wg__pap-detail">{detail}</p>
        <ul className="wg__pap-scores">
          <li>{formatRoundLine('Player 1', p1Round)}</li>
          <li>{formatRoundLine('Player 2', p2Round)}</li>
        </ul>
        <div className="wg__actions">
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
