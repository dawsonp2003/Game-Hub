import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps } from '../types'
import WordSetterSetup from '../../components/WordSetterSetup'
import '../../components/WordSetterSetup.css'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { scoreAsyncWordGuess, submitAsyncSecret } from '../../lib/async/word-games'
import { AsyncMatchSession } from '../../lib/multiplayer/async-session'
import { recordGameEnd } from '../../lib/stats'
import type { LetterResult } from '../../lib/words'
import { saveAsyncMatchCache } from '../../lib/checkpoint'
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
  | {
      type: 'wg:feedback'
      guess: string
      results: LetterResult[]
      won: boolean
      lost: boolean
      reveal?: string
    }
  | { type: 'wg:round-done'; won: boolean; guessCount: number }
  | { type: 'wg:peer-guess'; guessCount: number; won?: boolean; lost?: boolean }

export default function WordGuessAsync({
  session,
  asyncMatchId,
  onExit,
  onCheckpointClear,
}: Pick<GameProps, 'session' | 'asyncMatchId' | 'onExit' | 'onCheckpointClear'>) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [, setMySecret] = useState('')
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startTime = useRef(Date.now())
  const gameId = 'word-guess'
  const mySecretRef = useRef('')
  const peerGuessCountRef = useRef(0)
  const phaseRef = useRef<Phase>('setup')
  const matchId = asyncMatchId ?? ''

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const victoryHeadline =
    phase === 'results' && myRound && peerRound
      ? matchWinnerYouPeer(myRound, peerRound).headline
      : ''
  useVictoryConfetti(victoryHeadline)

  const cacheState = useCallback(() => {
    if (!matchId) return
    saveAsyncMatchCache(matchId, {
      phase,
      myWordSent,
      peerWordLen,
      myGuesses,
      myResults,
      myFinished,
      myReveal,
      peerGuessesOnMine,
      peerFinishedOnMine,
    })
  }, [
    matchId,
    phase,
    myWordSent,
    peerWordLen,
    myGuesses,
    myResults,
    myFinished,
    myReveal,
    peerGuessesOnMine,
    peerFinishedOnMine,
  ])

  useEffect(() => {
    cacheState()
  }, [cacheState])

  const maybeStart = useCallback(() => {
    if (phaseRef.current !== 'setup') return
    if (myWordSent && peerWordLen > 0) {
      phaseRef.current = 'play'
      setPhase('play')
      startTime.current = Date.now()
    }
  }, [myWordSent, peerWordLen])

  const showResults = useCallback(
    (mine: RoundSummary, peer: RoundSummary) => {
      if (phaseRef.current === 'results') return
      phaseRef.current = 'results'
      setMyRound(mine)
      setPeerRound(peer)
      setPhase('results')
      onCheckpointClear?.()
      const { headline } = matchWinnerYouPeer(mine, peer)
      const result: 'win' | 'loss' | undefined = headline.includes('You win')
        ? 'win'
        : headline.includes('Friend wins')
          ? 'loss'
          : undefined
      const opponentUserId =
        session instanceof AsyncMatchSession ? session.opponentUserId() ?? undefined : undefined
      recordGameEnd({
        gameId,
        mode: 'async',
        result,
        durationMs: Date.now() - startTime.current,
        startedAt: startTime.current,
        opponentUserId,
      })
    },
    [onCheckpointClear, session],
  )

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
        maybeStart()
      }

      if (m.type === 'wg:peer-guess') {
        setPeerGuessesOnMine(m.guessCount)
        peerGuessCountRef.current = m.guessCount
        if (m.won || m.lost) {
          setPeerFinishedOnMine(true)
          const peerSummary: RoundSummary = {
            won: !!m.won,
            guessCount: m.guessCount,
            secret: mySecretRef.current,
          }
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
            session.send({ type: 'wg:round-done', won: m.won, guessCount: next.length })
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
    })
  }, [session, maybeStart, checkBothDone])

  const handleMyGuess = useCallback(
    async (guess: string) => {
      if (!matchId || myFinished || busy) return
      setBusy(true)
      setError(null)
      try {
        const result = await scoreAsyncWordGuess(matchId, guess)
        setMyGuesses((g) => [...g, result.guess])
        setMyResults((r) => [...r, result.results])
        session?.send({
          type: 'wg:peer-guess',
          guessCount: result.guessCount,
          won: result.won,
          lost: result.lost,
        })
        if (result.won || result.lost) {
          setMyFinished(true)
          setMyReveal(result.reveal)
          const mine: RoundSummary = {
            won: result.won,
            guessCount: result.guessCount,
            secret: result.reveal ?? result.guess,
          }
          setMyRound(mine)
          session?.send({
            type: 'wg:peer-guess',
            guessCount: result.guessCount,
            won: result.won,
            lost: result.lost,
          })
          session?.send({ type: 'wg:round-done', won: result.won, guessCount: result.guessCount })
          setPeerRound((peer) => {
            if (peer) checkBothDone(mine, peer)
            return peer
          })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save guess')
      } finally {
        setBusy(false)
      }
    },
    [matchId, myFinished, busy, session, checkBothDone],
  )

  const handleWordConfirm = async (word: string) => {
    if (!matchId) return
    setBusy(true)
    setError(null)
    try {
      await submitAsyncSecret(matchId, word)
      setMySecret(word)
      mySecretRef.current = word
      setMyWordSent(true)
      session?.send({ type: 'wg:word-ready', wordLen: word.length })
      maybeStart()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save word')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'setup') {
    if (!myWordSent) {
      return (
        <WordSetterSetup
          key="async-set-word"
          mode="async"
          session={session}
          bothEnterWord
          minLen={2}
          maxLen={12}
          hint="Pick a word for your friend to guess"
          placeholder="Your secret word"
          onConfirm={(word) => void handleWordConfirm(word)}
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
        {error && <p className="wset__error">{error}</p>}
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
        {error && <p className="wg__status wg__error">{error}</p>}
        {!session?.isConnected && <p className="wg__status">Connecting…</p>}

        <p className="wg__section-label">Your guesses</p>
        <WordGuessPeerBoard
          wordLen={peerWordLen}
          guesses={myGuesses}
          results={myResults}
          finished={myFinished}
          revealedAnswer={myReveal}
          disabled={busy || !session?.isConnected}
          statusHint="Guess your friend's word"
          onSubmitGuess={(g) => void handleMyGuess(g)}
        />

        <p className="wg__section-label wg__section-label--peer">Friend guessing your word</p>
        <p className="wg__peer-progress">
          {peerFinishedOnMine && peerRound
            ? peerRound.won
              ? `They got it in ${peerRound.guessCount} guesses.`
              : `They didn't get it. Your word was ${mySecretRef.current}.`
            : `${peerGuessesOnMine}/${MAX_GUESSES} guesses`}
        </p>
      </div>
    )
  }

  return (
    <div className="wset">
      <p className="wset__status">Loading match…</p>
    </div>
  )
}
