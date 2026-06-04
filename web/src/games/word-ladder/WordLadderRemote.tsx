import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps } from '../types'
import WordSetterSetup from '../../components/WordSetterSetup'
import '../../components/WordSetterSetup.css'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { recordGameEnd } from '../../lib/stats'
import WordLadderBoard from './WordLadderBoard'
import {
  formatLadderRoundLine,
  matchLadderYouPeer,
  type LadderRoundSummary,
} from './word-ladder-match'
import './WordLadder.css'

type Phase = 'setup' | 'play' | 'results'

type LadderPair = { start: string; end: string }

type WlMessage =
  | { type: 'wl:ladder-ready'; start: string; end: string }
  | { type: 'wl:progress'; stepCount: number }
  | { type: 'wl:done'; finished: boolean; stepCount: number }
  | { type: 'wl:rematch' }

export default function WordLadderRemote({
  session,
  peerAway = false,
  onExit,
}: Pick<GameProps, 'session' | 'peerAway' | 'onExit'>) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [myLadderSent, setMyLadderSent] = useState(false)
  const [myLadderForPeer, setMyLadderForPeer] = useState<LadderPair | null>(null)
  const [peerLadderForMe, setPeerLadderForMe] = useState<LadderPair | null>(null)

  const [myRound, setMyRound] = useState<LadderRoundSummary | null>(null)
  const [peerRound, setPeerRound] = useState<LadderRoundSummary | null>(null)
  const [peerStepCount, setPeerStepCount] = useState(0)
  const [peerDone, setPeerDone] = useState(false)

  const startTime = useRef(Date.now())
  const gameId = 'word-ladder'
  const myLadderForPeerRef = useRef<LadderPair | null>(null)
  const myLadderSentRef = useRef(false)
  const peerLadderRef = useRef<LadderPair | null>(null)
  const phaseRef = useRef<Phase>('setup')

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const victoryHeadline =
    phase === 'results' && myRound && peerRound
      ? matchLadderYouPeer(myRound, peerRound).headline
      : ''
  useVictoryConfetti(victoryHeadline)

  const resetMatch = useCallback(() => {
    phaseRef.current = 'setup'
    setPhase('setup')
    setMyLadderSent(false)
    setMyLadderForPeer(null)
    setPeerLadderForMe(null)
    myLadderForPeerRef.current = null
    myLadderSentRef.current = false
    peerLadderRef.current = null
    setMyRound(null)
    setPeerRound(null)
    setPeerStepCount(0)
    setPeerDone(false)
    startTime.current = Date.now()
  }, [])

  const maybeStart = useCallback(() => {
    if (phaseRef.current !== 'setup') return
    if (myLadderSentRef.current && peerLadderRef.current) {
      phaseRef.current = 'play'
      setPeerLadderForMe(peerLadderRef.current)
      setPhase('play')
      startTime.current = Date.now()
    }
  }, [])

  const showResults = useCallback((mine: LadderRoundSummary, peer: LadderRoundSummary) => {
    if (phaseRef.current === 'results') return
    phaseRef.current = 'results'
    setMyRound(mine)
    setPeerRound(peer)
    setPhase('results')
    const { headline } = matchLadderYouPeer(mine, peer)
    const result: 'win' | 'loss' | undefined = headline.includes('You win')
      ? 'win'
      : headline.includes('Friend wins')
        ? 'loss'
        : undefined
    recordGameEnd({
      gameId,
      mode: 'remote',
      result,
      durationMs: Date.now() - startTime.current,
      startedAt: startTime.current,
    })
  }, [])

  const checkBothDone = useCallback(
    (mine: LadderRoundSummary | null, peer: LadderRoundSummary | null) => {
      if (mine && peer) showResults(mine, peer)
    },
    [showResults],
  )

  useEffect(() => {
    if (!session) return
    return session.onMessage((msg) => {
      const m = msg as WlMessage

      if (m.type === 'wl:ladder-ready') {
        const pair = { start: m.start, end: m.end }
        peerLadderRef.current = pair
        setPeerLadderForMe(pair)
        maybeStart()
      }

      if (m.type === 'wl:progress') {
        setPeerStepCount(m.stepCount)
      }

      if (m.type === 'wl:done') {
        const peerSummary: LadderRoundSummary = {
          finished: m.finished,
          stepCount: m.stepCount,
          start: peerLadderRef.current?.start ?? '',
          end: peerLadderRef.current?.end ?? '',
        }
        setPeerDone(true)
        setPeerRound(peerSummary)
        setMyRound((mine) => {
          if (mine) checkBothDone(mine, peerSummary)
          return mine
        })
      }

      if (m.type === 'wl:rematch') {
        resetMatch()
      }
    })
  }, [session, maybeStart, checkBothDone, resetMatch])

  const handleSetup = (endWord: string, startWord?: string) => {
    const pair = { start: startWord!.toUpperCase(), end: endWord.toUpperCase() }
    setMyLadderForPeer(pair)
    myLadderForPeerRef.current = pair
    setMyLadderSent(true)
    myLadderSentRef.current = true
    session?.send({
      type: 'wl:ladder-ready',
      start: pair.start,
      end: pair.end,
    } satisfies WlMessage)
    maybeStart()
  }

  const handleMyComplete = (result: LadderRoundSummary) => {
    setMyRound(result)
    session?.send({
      type: 'wl:done',
      finished: result.finished,
      stepCount: result.stepCount,
    } satisfies WlMessage)
    setPeerRound((peer) => {
      if (peer) checkBothDone(result, peer)
      return peer
    })
  }

  const handleMyStep = (stepCount: number) => {
    session?.send({ type: 'wl:progress', stepCount } satisfies WlMessage)
  }

  const requestRematch = () => {
    resetMatch()
    session?.send({ type: 'wl:rematch' } satisfies WlMessage)
  }

  if (phase === 'setup') {
    if (!myLadderSent) {
      return (
        <WordSetterSetup
          key="wl-remote-setup"
          mode="remote"
          session={session}
          bothEnterWord
          minLen={3}
          maxLen={6}
          hint="Set start and end words for your friend"
          placeholder="End word"
          secondField={{ label: 'Start word (for friend)', placeholder: 'Start word' }}
          onConfirm={handleSetup}
        />
      )
    }
    return (
      <div className="wset wl--results">
        <p className="wset__title">Ladder locked in</p>
        <p className="wset__status">
          {peerLadderForMe
            ? 'Friend is ready — starting…'
            : 'Waiting for your friend to set your ladder…'}
        </p>
        {myLadderForPeer && (
          <p className="wset__muted">
            You set: {myLadderForPeer.start} → {myLadderForPeer.end}
          </p>
        )}
        {!session?.isConnected && <p className="wset__muted">Connecting…</p>}
      </div>
    )
  }

  if (phase === 'results' && myRound && peerRound) {
    const { headline, detail } = matchLadderYouPeer(myRound, peerRound)
    return (
      <div className="wl wl--results">
        <p className="wl__results-headline">{headline}</p>
        <p className="wl__results-detail">{detail}</p>
        <ul className="wl__results-scores">
          <li>{formatLadderRoundLine('You', myRound)}</li>
          <li>{formatLadderRoundLine('Friend', peerRound)}</li>
        </ul>
        <div className="wl__actions">
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

  if (phase === 'play' && peerLadderForMe) {
    return (
      <div className="wl">
        {peerAway && <p className="wl__status">Friend stepped away — game saved.</p>}
        {!session?.isConnected && !peerAway && <p className="wl__status">Connecting…</p>}

        <p className="wl__section-label">Your ladder</p>
        <WordLadderBoard
          start={peerLadderForMe.start}
          end={peerLadderForMe.end}
          allowAnyWord
          disabled={peerAway || !session?.isConnected || !!myRound}
          statusHint="Reach the end in as few steps as you can"
          onStep={handleMyStep}
          onComplete={handleMyComplete}
        />

        <p className="wl__section-label wl__section-label--peer">Friend&apos;s progress</p>
        <p className="wl__peer-progress">
          {peerDone && peerRound
            ? peerRound.finished
              ? `They finished in ${peerRound.stepCount} steps.`
              : `They gave up after ${peerRound.stepCount} steps.`
            : `${peerStepCount} step${peerStepCount === 1 ? '' : 's'} so far`}
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
