import { useRef, useState } from 'react'
import WordSetterSetup from '../../components/WordSetterSetup'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { usePassAndPlayOpening } from '../../lib/turn-order/usePassAndPlayOpening'
import { recordGameEnd } from '../../lib/stats'
import WordLadderBoard from './WordLadderBoard'
import {
  formatLadderRoundLine,
  matchLadderWinner,
  type LadderRoundSummary,
} from './word-ladder-match'
import './WordLadder.css'

type Phase =
  | 'set-p1'
  | 'set-p2'
  | 'handoff-p1'
  | 'play-p1'
  | 'handoff-p2'
  | 'play-p2'
  | 'results'

type LadderPair = { start: string; end: string }

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
    <div className="wl wl--results">
      <p className="wl__results-headline">{title}</p>
      <p className="wl__results-detail">{body}</p>
      <button type="button" className="btn" onClick={onContinue}>
        {buttonLabel}
      </button>
    </div>
  )
}

export default function WordLadderPassAndPlay({ onExit }: { onExit: () => void }) {
  const gameId = 'word-ladder'
  const { openingPhase, rotateAfterMatch, nextOpeningPhase } = usePassAndPlayOpening(gameId)
  const [phase, setPhase] = useState<Phase>(openingPhase)
  /** Ladder Player 2 must solve (set by Player 1). */
  const [ladderForP2, setLadderForP2] = useState<LadderPair | null>(null)
  /** Ladder Player 1 must solve (set by Player 2). */
  const [ladderForP1, setLadderForP1] = useState<LadderPair | null>(null)
  const [p1Round, setP1Round] = useState<LadderRoundSummary | null>(null)
  const [p2Round, setP2Round] = useState<LadderRoundSummary | null>(null)
  const startTime = useRef(Date.now())

  const victoryHeadline =
    phase === 'results' && p1Round && p2Round
      ? matchLadderWinner(p1Round, p2Round, 'Player 1', 'Player 2').headline
      : ''
  useVictoryConfetti(victoryHeadline)

  const restart = () => {
    setPhase(nextOpeningPhase())
    setLadderForP2(null)
    setLadderForP1(null)
    setP1Round(null)
    setP2Round(null)
    startTime.current = Date.now()
  }

  const finishMatch = (r1: LadderRoundSummary, r2: LadderRoundSummary) => {
    setP1Round(r1)
    setP2Round(r2)
    setPhase('results')
    const { headline } = matchLadderWinner(r1, r2, 'Player 1', 'Player 2')
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

  if (phase === 'set-p1') {
    return (
      <WordSetterSetup
        key="wl-pap-p1"
        mode="pass-and-play"
        session={null}
        minLen={3}
        maxLen={6}
        hint="Player 1 — set start and end for Player 2's ladder"
        placeholder="End word"
        secondField={{ label: 'Start word', placeholder: 'Start word' }}
        onConfirm={(end, start) => {
          setLadderForP2({ start: start!, end })
          setPhase('set-p2')
        }}
      />
    )
  }

  if (phase === 'set-p2') {
    return (
      <WordSetterSetup
        key="wl-pap-p2"
        mode="pass-and-play"
        session={null}
        minLen={3}
        maxLen={6}
        hint="Player 2 — set start and end for Player 1's ladder"
        placeholder="End word"
        secondField={{ label: 'Start word', placeholder: 'Start word' }}
        onConfirm={(end, start) => {
          setLadderForP1({ start: start!, end })
          setPhase('handoff-p1')
        }}
      />
    )
  }

  if (phase === 'handoff-p1' && ladderForP1) {
    return (
      <PassHandoff
        title="Ladders are set"
        body={`Pass to Player 1. Climb from ${ladderForP1.start} to ${ladderForP1.end} in as few steps as you can.`}
        buttonLabel="Player 1 — start"
        onContinue={() => setPhase('play-p1')}
      />
    )
  }

  if (phase === 'play-p1' && ladderForP1) {
    return (
      <div className="wl">
        <p className="wl__player-tag">Player 1</p>
        <WordLadderBoard
          start={ladderForP1.start}
          end={ladderForP1.end}
          allowAnyWord
          statusHint="Fewest steps wins"
          onComplete={(result) => {
            setP1Round(result)
            setPhase('handoff-p2')
          }}
        />
      </div>
    )
  }

  if (phase === 'handoff-p2' && p1Round && ladderForP2) {
    const line = p1Round.finished
      ? `Player 1 finished in ${p1Round.stepCount} steps.`
      : `Player 1 gave up after ${p1Round.stepCount} steps.`
    return (
      <PassHandoff
        title="Player 1 is done"
        body={`${line} Pass to Player 2: ${ladderForP2.start} → ${ladderForP2.end}.`}
        buttonLabel="Player 2 — start"
        onContinue={() => setPhase('play-p2')}
      />
    )
  }

  if (phase === 'play-p2' && ladderForP2) {
    return (
      <div className="wl">
        <p className="wl__player-tag">Player 2</p>
        <WordLadderBoard
          start={ladderForP2.start}
          end={ladderForP2.end}
          allowAnyWord
          statusHint="Fewest steps wins"
          onComplete={(result) => {
            if (p1Round) finishMatch(p1Round, result)
          }}
        />
      </div>
    )
  }

  if (phase === 'results' && p1Round && p2Round) {
    const { headline, detail } = matchLadderWinner(p1Round, p2Round, 'Player 1', 'Player 2')
    return (
      <div className="wl wl--results">
        <p className="wl__results-headline">{headline}</p>
        <p className="wl__results-detail">{detail}</p>
        <ul className="wl__results-scores">
          <li>{formatLadderRoundLine('Player 1', p1Round)}</li>
          <li>{formatLadderRoundLine('Player 2', p2Round)}</li>
        </ul>
        <div className="wl__actions">
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
