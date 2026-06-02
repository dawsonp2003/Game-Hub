import { useRef, useState } from 'react'
import { stats } from '../../lib/stats'
import ChainSetterSetup from './ChainSetterSetup'
import WordChainBoard from './WordChainBoard'
import {
  formatChainRoundLine,
  matchChainWinner,
  type ChainRoundSummary,
} from './word-chain-match'
import './WordChain.css'

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
    <div className="wch wch--results">
      <p className="wch__results-headline">{title}</p>
      <p className="wch__results-detail">{body}</p>
      <button type="button" className="btn" onClick={onContinue}>
        {buttonLabel}
      </button>
    </div>
  )
}

export default function WordChainPassAndPlay({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('set-p1')
  const [chainForP2, setChainForP2] = useState<string[] | null>(null)
  const [chainForP1, setChainForP1] = useState<string[] | null>(null)
  const [p1Round, setP1Round] = useState<ChainRoundSummary | null>(null)
  const [p2Round, setP2Round] = useState<ChainRoundSummary | null>(null)
  const startTime = useRef(Date.now())
  const gameId = 'word-chain'

  const restart = () => {
    setPhase('set-p1')
    setChainForP2(null)
    setChainForP1(null)
    setP1Round(null)
    setP2Round(null)
    startTime.current = Date.now()
  }

  const finishMatch = (r1: ChainRoundSummary, r2: ChainRoundSummary) => {
    setP1Round(r1)
    setP2Round(r2)
    setPhase('results')
    stats.recordPlay(gameId, Date.now() - startTime.current)
    const { headline } = matchChainWinner(r1, r2, 'Player 1', 'Player 2')
    if (headline.includes('Player 1')) stats.recordResult(gameId, 'win')
    else if (headline.includes('Player 2')) stats.recordResult(gameId, 'loss')
  }

  if (phase === 'set-p1') {
    return (
      <ChainSetterSetup
        key="wc-pap-p1"
        mode="pass-and-play"
        session={null}
        hint="Player 1 — build an 8-word chain for Player 2"
        onConfirm={(chain) => {
          setChainForP2(chain)
          setPhase('set-p2')
        }}
      />
    )
  }

  if (phase === 'set-p2') {
    return (
      <ChainSetterSetup
        key="wc-pap-p2"
        mode="pass-and-play"
        session={null}
        hint="Player 2 — build an 8-word chain for Player 1"
        onConfirm={(chain) => {
          setChainForP1(chain)
          setPhase('handoff-p1')
        }}
      />
    )
  }

  if (phase === 'handoff-p1' && chainForP1) {
    return (
      <PassHandoff
        title="Chains are set"
        body={`Pass to Player 1. Their chain starts with ${chainForP1[0]} — guess each next word (first letters are hints).`}
        buttonLabel="Player 1 — start"
        onContinue={() => setPhase('play-p1')}
      />
    )
  }

  if (phase === 'play-p1' && chainForP1) {
    return (
      <div className="wch">
        <p className="wch__player-tag">Player 1</p>
        <WordChainBoard
          chain={chainForP1}
          statusHint="Fewest mistakes wins"
          onComplete={(result) => {
            setP1Round(result)
            setPhase('handoff-p2')
          }}
        />
      </div>
    )
  }

  if (phase === 'handoff-p2' && p1Round && chainForP2) {
    const line = formatChainRoundLine('Player 1', p1Round)
    return (
      <PassHandoff
        title="Player 1 is done"
        body={`${line} Pass to Player 2 — chain starts with ${chainForP2[0]}.`}
        buttonLabel="Player 2 — start"
        onContinue={() => setPhase('play-p2')}
      />
    )
  }

  if (phase === 'play-p2' && chainForP2) {
    return (
      <div className="wch">
        <p className="wch__player-tag">Player 2</p>
        <WordChainBoard
          chain={chainForP2}
          statusHint="Fewest mistakes wins"
          onComplete={(result) => {
            if (p1Round) finishMatch(p1Round, result)
          }}
        />
      </div>
    )
  }

  if (phase === 'results' && p1Round && p2Round) {
    const { headline, detail } = matchChainWinner(p1Round, p2Round, 'Player 1', 'Player 2')
    return (
      <div className="wch wch--results">
        <p className="wch__results-headline">{headline}</p>
        <p className="wch__results-detail">{detail}</p>
        <ul className="wch__results-scores">
          <li>{formatChainRoundLine('Player 1', p1Round)}</li>
          <li>{formatChainRoundLine('Player 2', p2Round)}</li>
        </ul>
        <div className="wch__actions">
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
