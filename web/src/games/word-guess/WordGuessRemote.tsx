import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps } from '../types'
import WordSetterSetup from '../../components/WordSetterSetup'
import '../../components/WordSetterSetup.css'
import { stats } from '../../lib/stats'
import { scoreWordGuess, type LetterResult } from '../../lib/words'
import WordGuessPeerBoard from './WordGuessPeerBoard'
import {
  formatRoundLine,
  matchWinnerYouPeer,
  type RoundSummary,
} from './word-guess-match'
import { MAX_GUESSES } from './WordGuessBoard'
import './WordGuess.css'

type Phase = 'setup' | 'play' | 'results'

type WgMessage =
  | { type: 'wg:word-ready'; wordLen: number }
  | { type: 'wg:guess'; guess: string }
  | {
      type: 'wg:feedback'
      guess: string
      results: LetterResult[]
      won: boolean
      lost: boolean
      reveal?: string
    }
  | { type: 'wg:round-done'; won: boolean; guessCount: number }
  | { type: 'wg:rematch' }

export default function WordGuessRemote({
  session,
  peerAway = false,
  onExit,
}: Pick<GameProps, 'session' | 'peerAway' | 'onExit'>) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [mySecret, setMySecret] = useState('')
  const [myWordSent, setMyWordSent] = useState(false)
  const [peerWordLen, setPeerWordLen] = useState(0)

  const [myGuesses, setMyGuesses] = useState<string[]>([])
  const [myResults, setMyResults] = useState<LetterResult[][]>([])
  const [myFinished, setMyFinished] = useState(false)
  const [myReveal, setMyReveal] = useState<string | null>(null)

  const [peerGuessesOnMine, setPeerGuessesOnMine] = useState(0)
  const [peerFinishedOnMine, setPeerFinishedOnMine] = useState(false)

  const [myRound, setMyRound] = useState<RoundSummary | null>(null)
  const [peerRound, setPeerRound] = useState<RoundSummary | null>(null)

  const startTime = useRef(Date.now())
  const gameId = 'word-guess'
  const mySecretRef = useRef('')
  const peerGuessCountRef = useRef(0)
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

  const resetMatch = useCallback(() => {
    phaseRef.current = 'setup'
    setPhase('setup')
    setMySecret('')
    setMyWordSent(false)
    setPeerWordLen(0)
    myWordSentRef.current = false
    peerWordLenRef.current = 0
    peerGuessCountRef.current = 0
    setMyGuesses([])
    setMyResults([])
    setMyFinished(false)
    setMyReveal(null)
    setPeerGuessesOnMine(0)
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
      startTime.current = Date.now()
    }
  }, [])

  const showResults = useCallback((mine: RoundSummary, peer: RoundSummary) => {
    if (phaseRef.current === 'results') return
    phaseRef.current = 'results'
    setMyRound(mine)
    setPeerRound(peer)
    setPhase('results')
    stats.recordPlay(gameId, Date.now() - startTime.current)
    const { headline } = matchWinnerYouPeer(mine, peer)
    if (headline.includes('You win')) stats.recordResult(gameId, 'win')
    else if (headline.includes('Friend wins')) stats.recordResult(gameId, 'loss')
  }, [])

  const checkBothDone = useCallback(
    (mine: RoundSummary | null, peer: RoundSummary | null) => {
      if (mine && peer) showResults(mine, peer)
    },
    [showResults],
  )

  useEffect(() => {
    if (!session) return
    return session.onMessage((msg) => {
      const m = msg as WgMessage

      if (m.type === 'wg:word-ready') {
        setPeerWordLen(m.wordLen)
        peerWordLenRef.current = m.wordLen
        maybeStart()
      }

      if (m.type === 'wg:guess' && phaseRef.current === 'play') {
        const secret = mySecretRef.current
        if (!secret) return

        peerGuessCountRef.current += 1
        const nextCount = peerGuessCountRef.current
        setPeerGuessesOnMine(nextCount)

        const scored = scoreWordGuess(m.guess, secret)
        const won = m.guess === secret
        const lost = !won && nextCount >= MAX_GUESSES

        session.send({
          type: 'wg:feedback',
          guess: m.guess,
          results: scored,
          won,
          lost,
          reveal: won || lost ? secret : undefined,
        } satisfies WgMessage)

        if (won || lost) {
          setPeerFinishedOnMine(true)
          const peerSummary: RoundSummary = { won, guessCount: nextCount, secret }
          setPeerRound(peerSummary)
          setMyRound((mine) => {
            if (mine) checkBothDone(mine, peerSummary)
            return mine
          })
        }
      }

      if (m.type === 'wg:feedback') {
        setMyGuesses((g) => {
          const next = [...g, m.guess]
          if (m.won || m.lost) {
            const reveal = m.reveal ?? m.guess
            const mine: RoundSummary = { won: m.won, guessCount: next.length, secret: reveal }
            setMyFinished(true)
            setMyReveal(reveal)
            setMyRound(mine)
            session.send({
              type: 'wg:round-done',
              won: m.won,
              guessCount: next.length,
            } satisfies WgMessage)
            setPeerRound((peer) => {
              if (peer) checkBothDone(mine, peer)
              return peer
            })
          }
          return next
        })
        setMyResults((r) => [...r, m.results])
      }

      if (m.type === 'wg:round-done') {
        const peerSummary: RoundSummary = {
          won: m.won,
          guessCount: m.guessCount,
          secret: mySecretRef.current,
        }
        setPeerFinishedOnMine(true)
        setPeerRound(peerSummary)
        setMyRound((mine) => {
          if (mine) checkBothDone(mine, peerSummary)
          return mine
        })
      }

      if (m.type === 'wg:rematch') {
        resetMatch()
      }
    })
  }, [session, maybeStart, checkBothDone, resetMatch])

  const handleMyGuess = useCallback(
    (guess: string) => {
      if (!session || myFinished || peerAway) return
      session.send({ type: 'wg:guess', guess } satisfies WgMessage)
    },
    [session, myFinished, peerAway],
  )

  const handleWordConfirm = (word: string) => {
    setMySecret(word)
    mySecretRef.current = word
    setMyWordSent(true)
    myWordSentRef.current = true
    session?.send({ type: 'wg:word-ready', wordLen: word.length } satisfies WgMessage)
    maybeStart()
  }

  const requestRematch = () => {
    resetMatch()
    session?.send({ type: 'wg:rematch' } satisfies WgMessage)
  }

  if (phase === 'setup') {
    if (!myWordSent) {
      return (
        <WordSetterSetup
          key="remote-set-word"
          mode="remote"
          session={session}
          bothEnterWord
          minLen={2}
          maxLen={12}
          hint="Pick a word for your friend to guess"
          placeholder="Your secret word"
          onConfirm={handleWordConfirm}
        />
      )
    }
    return (
      <div className="wset wg--pap">
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
    const { headline, detail } = matchWinnerYouPeer(myRound, peerRound)
    return (
      <div className="wg wg--pap">
        <p className="wg__pap-headline">{headline}</p>
        <p className="wg__pap-detail">{detail}</p>
        <ul className="wg__pap-scores">
          <li>{formatRoundLine('You', myRound)}</li>
          <li>{formatRoundLine('Friend', peerRound)}</li>
        </ul>
        <div className="wg__actions">
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
      <div className="wg">
        {peerAway && <p className="wg__status">Friend stepped away — game saved.</p>}
        {!session?.isConnected && !peerAway && <p className="wg__status">Connecting…</p>}

        <p className="wg__section-label">Your guesses</p>
        <WordGuessPeerBoard
          wordLen={peerWordLen}
          guesses={myGuesses}
          results={myResults}
          finished={myFinished}
          revealedAnswer={myReveal}
          disabled={peerAway || !session?.isConnected}
          statusHint="Guess your friend's word"
          onSubmitGuess={handleMyGuess}
        />

        <p className="wg__section-label wg__section-label--peer">Friend guessing your word</p>
        <p className="wg__peer-progress">
          {peerFinishedOnMine && peerRound
            ? peerRound.won
              ? `They got it in ${peerRound.guessCount} guesses.`
              : `They didn't get it. Your word was ${mySecret}.`
            : `${peerGuessesOnMine}/${MAX_GUESSES} guesses`}
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
