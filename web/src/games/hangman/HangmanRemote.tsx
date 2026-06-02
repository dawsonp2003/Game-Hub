import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps } from '../types'
import WordSetterSetup from '../../components/WordSetterSetup'
import '../../components/WordSetterSetup.css'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { stats } from '../../lib/stats'
import HangmanFigure, { MAX_WRONG } from './HangmanFigure'
import HangmanPeerBoard from './HangmanPeerBoard'
import {
  formatHangmanRoundLine,
  matchHangmanYouPeer,
  type HangmanRoundSummary,
} from './hangman-match'
import './Hangman.css'

type Phase = 'setup' | 'play' | 'results'

type HmMessage =
  | { type: 'hm:word-ready'; wordLen: number }
  | { type: 'hm:guess'; letter: string }
  | {
      type: 'hm:state'
      guessed: string[]
      display: string
      wrongCount: number
      won: boolean
      lost: boolean
      reveal?: string
    }
  | { type: 'hm:round-done'; won: boolean; wrongCount: number }
  | { type: 'hm:rematch' }

function blanksDisplay(wordLen: number): string {
  return Array.from({ length: wordLen }, () => '_').join(' ')
}

function buildDisplay(secret: string, guessed: Set<string>): string {
  return secret
    .split('')
    .map((ch) => (guessed.has(ch) ? ch : '_'))
    .join(' ')
}

function evaluate(secret: string, guessed: Set<string>) {
  const wrongCount = [...guessed].filter((ch) => !secret.includes(ch)).length
  const won = secret.split('').every((ch) => guessed.has(ch))
  const lost = wrongCount >= MAX_WRONG
  return { wrongCount, won, lost }
}

export default function HangmanRemote({
  session,
  peerAway = false,
  onExit,
}: Pick<GameProps, 'session' | 'peerAway' | 'onExit'>) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [mySecret, setMySecret] = useState('')
  const [myWordSent, setMyWordSent] = useState(false)
  const [peerWordLen, setPeerWordLen] = useState(0)

  const [myGuessed, setMyGuessed] = useState<string[]>([])
  const [myDisplay, setMyDisplay] = useState('')
  const [myWrong, setMyWrong] = useState(0)
  const [myFinished, setMyFinished] = useState(false)
  const [myReveal, setMyReveal] = useState<string | null>(null)

  const [peerWrongOnMine, setPeerWrongOnMine] = useState(0)
  const [peerFinishedOnMine, setPeerFinishedOnMine] = useState(false)

  const [myRound, setMyRound] = useState<HangmanRoundSummary | null>(null)
  const [peerRound, setPeerRound] = useState<HangmanRoundSummary | null>(null)

  const startTime = useRef(Date.now())
  const gameId = 'hangman'
  const mySecretRef = useRef('')
  const peerGuessedOnMineRef = useRef<Set<string>>(new Set())
  const myWordSentRef = useRef(false)
  const peerWordLenRef = useRef(0)
  const phaseRef = useRef<Phase>('setup')

  useEffect(() => {
    mySecretRef.current = mySecret
  }, [mySecret])

  useEffect(() => {
    myWordSentRef.current = myWordSent
  }, [myWordSent])

  useEffect(() => {
    peerWordLenRef.current = peerWordLen
  }, [peerWordLen])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const victoryHeadline =
    phase === 'results' && myRound && peerRound
      ? matchHangmanYouPeer(myRound, peerRound).headline
      : ''
  useVictoryConfetti(victoryHeadline)

  const resetMatch = useCallback(() => {
    phaseRef.current = 'setup'
    setPhase('setup')
    setMySecret('')
    setMyWordSent(false)
    setPeerWordLen(0)
    myWordSentRef.current = false
    peerWordLenRef.current = 0
    peerGuessedOnMineRef.current = new Set()
    setMyGuessed([])
    setMyDisplay('')
    setMyWrong(0)
    setMyFinished(false)
    setMyReveal(null)
    setPeerWrongOnMine(0)
    setPeerFinishedOnMine(false)
    setMyRound(null)
    setPeerRound(null)
    startTime.current = Date.now()
  }, [])

  const maybeStart = useCallback(() => {
    if (phaseRef.current !== 'setup') return
    if (myWordSentRef.current && peerWordLenRef.current > 0) {
      phaseRef.current = 'play'
      setPhase('play')
      setMyDisplay(blanksDisplay(peerWordLenRef.current))
      startTime.current = Date.now()
    }
  }, [])

  const showResults = useCallback((mine: HangmanRoundSummary, peer: HangmanRoundSummary) => {
    if (phaseRef.current === 'results') return
    phaseRef.current = 'results'
    setMyRound(mine)
    setPeerRound(peer)
    setPhase('results')
    stats.recordPlay(gameId, Date.now() - startTime.current)
    const { headline } = matchHangmanYouPeer(mine, peer)
    if (headline.includes('You win')) stats.recordResult(gameId, 'win')
    else if (headline.includes('Friend wins')) stats.recordResult(gameId, 'loss')
  }, [])

  const checkBothDone = useCallback(
    (mine: HangmanRoundSummary | null, peer: HangmanRoundSummary | null) => {
      if (mine && peer) showResults(mine, peer)
    },
    [showResults],
  )

  useEffect(() => {
    if (!session) return
    return session.onMessage((msg) => {
      const m = msg as HmMessage

      if (m.type === 'hm:word-ready') {
        setPeerWordLen(m.wordLen)
        peerWordLenRef.current = m.wordLen
        maybeStart()
      }

      if (m.type === 'hm:guess' && phaseRef.current === 'play') {
        const secret = mySecretRef.current
        if (!secret) return

        const next = new Set(peerGuessedOnMineRef.current)
        if (next.has(m.letter)) return
        next.add(m.letter)
        peerGuessedOnMineRef.current = next

        const { wrongCount, won, lost } = evaluate(secret, next)
        setPeerWrongOnMine(wrongCount)

        session.send({
          type: 'hm:state',
          guessed: [...next],
          display: buildDisplay(secret, next),
          wrongCount,
          won,
          lost,
          reveal: won || lost ? secret : undefined,
        } satisfies HmMessage)

        if (won || lost) {
          setPeerFinishedOnMine(true)
          const peerSummary: HangmanRoundSummary = { won, wrongCount, secret }
          setPeerRound(peerSummary)
          setMyRound((mine) => {
            if (mine) checkBothDone(mine, peerSummary)
            return mine
          })
        }
      }

      if (m.type === 'hm:state' && phaseRef.current === 'play') {
        setMyGuessed(m.guessed)
        setMyDisplay(m.display)
        setMyWrong(m.wrongCount)
        if (m.won || m.lost) {
          const reveal = m.reveal ?? mySecretRef.current
          setMyFinished(true)
          setMyReveal(reveal)
          const mine: HangmanRoundSummary = {
            won: m.won,
            wrongCount: m.wrongCount,
            secret: reveal,
          }
          setMyRound(mine)
          session.send({
            type: 'hm:round-done',
            won: m.won,
            wrongCount: m.wrongCount,
          } satisfies HmMessage)
          setPeerRound((peer) => {
            if (peer) checkBothDone(mine, peer)
            return peer
          })
        }
      }

      if (m.type === 'hm:round-done') {
        const peerSummary: HangmanRoundSummary = {
          won: m.won,
          wrongCount: m.wrongCount,
          secret: mySecretRef.current,
        }
        setPeerFinishedOnMine(true)
        setPeerRound(peerSummary)
        setMyRound((mine) => {
          if (mine) checkBothDone(mine, peerSummary)
          return mine
        })
      }

      if (m.type === 'hm:rematch') {
        resetMatch()
      }
    })
  }, [session, maybeStart, checkBothDone, resetMatch])

  const handleMyGuess = useCallback(
    (letter: string) => {
      if (!session || myFinished || peerAway || myGuessed.includes(letter)) return
      session.send({ type: 'hm:guess', letter } satisfies HmMessage)
    },
    [session, myFinished, peerAway, myGuessed],
  )

  const handleWordConfirm = (word: string) => {
    setMySecret(word)
    mySecretRef.current = word
    peerGuessedOnMineRef.current = new Set()
    setMyWordSent(true)
    myWordSentRef.current = true
    session?.send({ type: 'hm:word-ready', wordLen: word.length } satisfies HmMessage)
    maybeStart()
  }

  const requestRematch = () => {
    resetMatch()
    session?.send({ type: 'hm:rematch' } satisfies HmMessage)
  }

  if (phase === 'setup') {
    if (!myWordSent) {
      return (
        <WordSetterSetup
          key="hm-remote-set"
          mode="remote"
          session={session}
          bothEnterWord
          minLen={2}
          maxLen={14}
          hint="Pick a word for your friend to guess"
          placeholder="Your secret word"
          onConfirm={handleWordConfirm}
        />
      )
    }
    return (
      <div className="wset hm--results">
        <p className="wset__title">Word locked in</p>
        <p className="wset__status">
          {peerWordLen > 0
            ? 'Friend is ready — starting…'
            : 'Waiting for your friend to enter their word…'}
        </p>
        {!session?.isConnected && <p className="wset__muted">Connecting…</p>}
      </div>
    )
  }

  if (phase === 'results' && myRound && peerRound) {
    const { headline, detail } = matchHangmanYouPeer(myRound, peerRound)
    return (
      <div className="hm hm--results">
        <p className="hm__results-headline">{headline}</p>
        <p className="hm__results-detail">{detail}</p>
        <ul className="hm__results-scores">
          <li>{formatHangmanRoundLine('You', myRound)}</li>
          <li>{formatHangmanRoundLine('Friend', peerRound)}</li>
        </ul>
        <div className="hm__actions">
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

  if (phase === 'play' && peerWordLen > 0) {
    return (
      <div className="hm">
        {peerAway && <p className="hm__status">Friend stepped away — game saved.</p>}
        {!session?.isConnected && !peerAway && <p className="hm__status">Connecting…</p>}

        <p className="hm__section-label">Your game</p>
        <HangmanPeerBoard
          display={myDisplay}
          guessed={myGuessed}
          wrongCount={myWrong}
          finished={myFinished}
          revealedAnswer={myReveal}
          disabled={peerAway || !session?.isConnected}
          statusHint={`${MAX_WRONG - myWrong} wrong guesses left`}
          onGuess={handleMyGuess}
        />

        <p className="hm__section-label hm__section-label--peer">Friend guessing your word</p>
        <div className="hm__peer-watch">
          <HangmanFigure wrongCount={peerWrongOnMine} />
          <p className="hm__peer-watch-text">
            {peerFinishedOnMine && peerRound
              ? peerRound.won
                ? `They solved it with ${peerRound.wrongCount} wrong guesses.`
                : `They didn't solve it (${peerRound.wrongCount} wrong).`
              : `${peerWrongOnMine}/${MAX_WRONG} wrong guesses`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="wset">
      <p className="wset__status">Connecting…</p>
    </div>
  )
}
