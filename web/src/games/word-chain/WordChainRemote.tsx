import { useCallback, useEffect, useRef, useState } from 'react'
import { stats } from '../../lib/stats'
import type { GameProps } from '../types'
import ChainSetterSetup from './ChainSetterSetup'
import WordChainBoard from './WordChainBoard'
import {
  formatChainRoundLine,
  matchChainYouPeer,
  type ChainRoundSummary,
} from './word-chain-match'
import './WordChain.css'

type Phase = 'setup' | 'play' | 'results'

type WcMessage =
  | { type: 'wc:chain-ready'; words: string[] }
  | { type: 'wc:progress'; mistakes: number; revealedCount: number }
  | { type: 'wc:done'; finished: boolean; mistakes: number; revealedCount: number }
  | { type: 'wc:rematch' }

export default function WordChainRemote({
  session,
  peerAway = false,
  onExit,
}: Pick<GameProps, 'session' | 'peerAway' | 'onExit'>) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [myChainSent, setMyChainSent] = useState(false)
  const [myChainForPeer, setMyChainForPeer] = useState<string[] | null>(null)
  const [peerChainForMe, setPeerChainForMe] = useState<string[] | null>(null)

  const [myRound, setMyRound] = useState<ChainRoundSummary | null>(null)
  const [peerRound, setPeerRound] = useState<ChainRoundSummary | null>(null)
  const [peerProgress, setPeerProgress] = useState({ mistakes: 0, revealedCount: 1 })
  const [peerDone, setPeerDone] = useState(false)

  const startTime = useRef(Date.now())
  const gameId = 'word-chain'
  const myChainForPeerRef = useRef<string[] | null>(null)
  const myChainSentRef = useRef(false)
  const peerChainRef = useRef<string[] | null>(null)
  const phaseRef = useRef<Phase>('setup')

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const resetMatch = useCallback(() => {
    phaseRef.current = 'setup'
    setPhase('setup')
    setMyChainSent(false)
    setMyChainForPeer(null)
    setPeerChainForMe(null)
    myChainForPeerRef.current = null
    myChainSentRef.current = false
    peerChainRef.current = null
    setMyRound(null)
    setPeerRound(null)
    setPeerProgress({ mistakes: 0, revealedCount: 1 })
    setPeerDone(false)
    startTime.current = Date.now()
  }, [])

  const maybeStart = useCallback(() => {
    if (phaseRef.current !== 'setup') return
    if (myChainSentRef.current && peerChainRef.current) {
      phaseRef.current = 'play'
      setPeerChainForMe(peerChainRef.current)
      setPhase('play')
      startTime.current = Date.now()
    }
  }, [])

  const showResults = useCallback((mine: ChainRoundSummary, peer: ChainRoundSummary) => {
    if (phaseRef.current === 'results') return
    phaseRef.current = 'results'
    setMyRound(mine)
    setPeerRound(peer)
    setPhase('results')
    stats.recordPlay(gameId, Date.now() - startTime.current)
    const { headline } = matchChainYouPeer(mine, peer)
    if (headline.includes('You win')) stats.recordResult(gameId, 'win')
    else if (headline.includes('Friend wins')) stats.recordResult(gameId, 'loss')
  }, [])

  const checkBothDone = useCallback(
    (mine: ChainRoundSummary | null, peer: ChainRoundSummary | null) => {
      if (mine && peer) showResults(mine, peer)
    },
    [showResults],
  )

  useEffect(() => {
    if (!session) return
    return session.onMessage((msg) => {
      const m = msg as WcMessage

      if (m.type === 'wc:chain-ready') {
        const chain = m.words.map((w) => w.toUpperCase())
        peerChainRef.current = chain
        setPeerChainForMe(chain)
        maybeStart()
      }

      if (m.type === 'wc:progress') {
        setPeerProgress({ mistakes: m.mistakes, revealedCount: m.revealedCount })
      }

      if (m.type === 'wc:done') {
        const peerSummary: ChainRoundSummary = {
          finished: m.finished,
          mistakes: m.mistakes,
          revealedCount: m.revealedCount,
        }
        setPeerDone(true)
        setPeerRound(peerSummary)
        setMyRound((mine) => {
          if (mine) checkBothDone(mine, peerSummary)
          return mine
        })
      }

      if (m.type === 'wc:rematch') {
        resetMatch()
      }
    })
  }, [session, maybeStart, checkBothDone, resetMatch])

  const handleSetup = (chain: string[]) => {
    setMyChainForPeer(chain)
    myChainForPeerRef.current = chain
    setMyChainSent(true)
    myChainSentRef.current = true
    session?.send({ type: 'wc:chain-ready', words: chain } satisfies WcMessage)
    maybeStart()
  }

  const handleMyComplete = (result: ChainRoundSummary) => {
    setMyRound(result)
    session?.send({
      type: 'wc:done',
      finished: result.finished,
      mistakes: result.mistakes,
      revealedCount: result.revealedCount,
    } satisfies WcMessage)
    setPeerRound((peer) => {
      if (peer) checkBothDone(result, peer)
      return peer
    })
  }

  const handleMyProgress = (progress: Pick<ChainRoundSummary, 'mistakes' | 'revealedCount'>) => {
    session?.send({
      type: 'wc:progress',
      mistakes: progress.mistakes,
      revealedCount: progress.revealedCount,
    } satisfies WcMessage)
  }

  const requestRematch = () => {
    resetMatch()
    session?.send({ type: 'wc:rematch' } satisfies WcMessage)
  }

  if (phase === 'setup') {
    if (!myChainSent) {
      return (
        <ChainSetterSetup
          key="wc-remote-setup"
          mode="remote"
          session={session}
          bothEnterChain
          hint="Build an 8-word chain for your friend"
          onConfirm={handleSetup}
        />
      )
    }
    return (
      <div className="wset wch--results">
        <p className="wset__title">Chain locked in</p>
        <p className="wset__status">
          {peerChainForMe
            ? 'Friend is ready — starting…'
            : 'Waiting for your friend to build your chain…'}
        </p>
        {myChainForPeer && (
          <p className="wset__muted">
            Your chain starts with {myChainForPeer[0]} and ends with {myChainForPeer[myChainForPeer.length - 1]}
          </p>
        )}
        {!session?.isConnected && <p className="wset__muted">Connecting…</p>}
      </div>
    )
  }

  if (phase === 'results' && myRound && peerRound) {
    const { headline, detail } = matchChainYouPeer(myRound, peerRound)
    return (
      <div className="wch wch--results">
        <p className="wch__results-headline">{headline}</p>
        <p className="wch__results-detail">{detail}</p>
        <ul className="wch__results-scores">
          <li>{formatChainRoundLine('You', myRound)}</li>
          <li>{formatChainRoundLine('Friend', peerRound)}</li>
        </ul>
        <div className="wch__actions">
          <button type="button" className="btn" onClick={requestRematch}>
            Play again
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'play' && peerChainForMe) {
    return (
      <div className="wch">
        {peerAway && <p className="wch__status">Friend stepped away — game saved.</p>}
        {!session?.isConnected && !peerAway && <p className="wch__status">Connecting…</p>}

        <p className="wch__section-label">Your chain</p>
        <WordChainBoard
          chain={peerChainForMe}
          disabled={peerAway || !session?.isConnected || !!myRound}
          statusHint="Fewest mistakes wins when both finish"
          onProgress={handleMyProgress}
          onComplete={handleMyComplete}
        />

        <p className="wch__section-label wch__section-label--peer">Friend&apos;s progress</p>
        <p className="wch__peer-progress">
          {peerDone && peerRound
            ? peerRound.finished
              ? `Finished with ${peerRound.mistakes} mistake${peerRound.mistakes === 1 ? '' : 's'}`
              : `Gave up at ${peerRound.revealedCount - 1}/7 words (${peerRound.mistakes} mistakes)`
            : `${peerProgress.revealedCount - 1}/7 words · ${peerProgress.mistakes} mistake${peerProgress.mistakes === 1 ? '' : 's'}`}
        </p>
      </div>
    )
  }

  return (
    <div className="wset">
      <p className="wset__status">Connecting…</p>
    </div>
  )
}
