import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps } from '../types'
import WordSetterSetup from '../../components/WordSetterSetup'
import '../../components/WordSetterSetup.css'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { scoreAsyncHangmanGuess, submitAsyncSecret } from '../../lib/async/word-games'
import { AsyncMatchSession } from '../../lib/multiplayer/async-session'
import { recordGameEnd } from '../../lib/stats'
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
  | { type: 'hm:peer-guess'; wrongCount: number; won?: boolean; lost?: boolean }

function blanksDisplay(wordLen: number): string {
  return Array.from({ length: wordLen }, () => '_').join(' ')
}

export default function HangmanAsync({
  session,
  asyncMatchId,
  onExit,
  onCheckpointClear,
}: Pick<GameProps, 'session' | 'asyncMatchId' | 'onExit' | 'onCheckpointClear'>) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [, setMySecret] = useState('')
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startTime = useRef(Date.now())
  const gameId = 'hangman'
  const mySecretRef = useRef('')
  const phaseRef = useRef<Phase>('setup')
  const matchId = asyncMatchId ?? ''

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const victoryHeadline =
    phase === 'results' && myRound && peerRound
      ? matchHangmanYouPeer(myRound, peerRound).headline
      : ''
  useVictoryConfetti(victoryHeadline)

  const maybeStart = useCallback(() => {
    if (phaseRef.current !== 'setup') return
    if (myWordSent && peerWordLen > 0) {
      phaseRef.current = 'play'
      setPhase('play')
      setMyDisplay(blanksDisplay(peerWordLen))
      startTime.current = Date.now()
    }
  }, [myWordSent, peerWordLen])

  const showResults = useCallback(
    (mine: HangmanRoundSummary, peer: HangmanRoundSummary) => {
      if (phaseRef.current === 'results') return
      phaseRef.current = 'results'
      setMyRound(mine)
      setPeerRound(peer)
      setPhase('results')
      onCheckpointClear?.()
      const { headline } = matchHangmanYouPeer(mine, peer)
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
        maybeStart()
      }

      if (m.type === 'hm:peer-guess') {
        setPeerWrongOnMine(m.wrongCount)
        if (m.won || m.lost) {
          setPeerFinishedOnMine(true)
          const peerSummary: HangmanRoundSummary = {
            won: !!m.won,
            wrongCount: m.wrongCount,
            secret: mySecretRef.current,
          }
          setPeerRound(peerSummary)
          setMyRound((mine) => {
            if (mine) checkBothDone(mine, peerSummary)
            return mine
          })
        }
      }

      if (m.type === 'hm:state') {
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
          session.send({ type: 'hm:round-done', won: m.won, wrongCount: m.wrongCount })
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
    })
  }, [session, maybeStart, checkBothDone])

  const handleMyGuess = useCallback(
    async (letter: string) => {
      if (!matchId || myFinished || busy || myGuessed.includes(letter)) return
      setBusy(true)
      setError(null)
      try {
        const result = await scoreAsyncHangmanGuess(matchId, letter)
        setMyGuessed(result.guessed)
        setMyDisplay(result.display)
        setMyWrong(result.wrongCount)
        session?.send({
          type: 'hm:peer-guess',
          wrongCount: result.wrongCount,
          won: result.won,
          lost: result.lost,
        })
        if (result.won || result.lost) {
          setMyFinished(true)
          setMyReveal(result.reveal)
          const mine: HangmanRoundSummary = {
            won: result.won,
            wrongCount: result.wrongCount,
            secret: result.reveal ?? mySecretRef.current,
          }
          setMyRound(mine)
          session?.send({
            type: 'hm:round-done',
            won: result.won,
            wrongCount: result.wrongCount,
          })
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
    [matchId, myFinished, busy, myGuessed, session, checkBothDone],
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
      session?.send({ type: 'hm:word-ready', wordLen: word.length })
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
          key="hm-async-set"
          mode="async"
          session={session}
          bothEnterWord
          minLen={2}
          maxLen={14}
          hint="Pick a word for your friend to guess"
          placeholder="Your secret word"
          onConfirm={(word) => void handleWordConfirm(word)}
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
        {error && <p className="wset__error">{error}</p>}
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
        {error && <p className="hm__status">{error}</p>}
        {!session?.isConnected && <p className="hm__status">Connecting…</p>}

        <p className="hm__section-label">Your game</p>
        <HangmanPeerBoard
          display={myDisplay}
          guessed={myGuessed}
          wrongCount={myWrong}
          finished={myFinished}
          revealedAnswer={myReveal}
          disabled={busy || !session?.isConnected}
          statusHint={`${MAX_WRONG - myWrong} wrong guesses left`}
          onGuess={(l) => void handleMyGuess(l)}
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
      <p className="wset__status">Loading match…</p>
    </div>
  )
}
