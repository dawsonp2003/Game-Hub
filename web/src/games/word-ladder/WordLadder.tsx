import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { stats } from '../../lib/stats'
import { isValidLadderStep, LADDER_PUZZLES, pickRandomLadderPuzzle } from '../../lib/words'
import './WordLadder.css'

type LadderMessage =
  | { type: 'ladder:start'; start: string; end: string; puzzleIndex: number }
  | { type: 'ladder:step'; word: string; chain: string[] }
  | { type: 'ladder:new'; puzzleIndex: number; start: string; end: string }

function puzzleByIndex(index: number) {
  const puzzle = LADDER_PUZZLES[index] ?? pickRandomLadderPuzzle()
  return {
    start: puzzle.start.toUpperCase(),
    end: puzzle.end.toUpperCase(),
    minSteps: puzzle.minSteps,
  }
}

function moverLabel(
  mode: GameProps['mode'],
  turnBeforeMove: number,
  role: GameProps['session'] extends infer S ? (S extends { role: infer R } ? R : null) : null,
): string {
  if (mode === 'single') return 'You win!'
  if (mode === 'pass-and-play') return turnBeforeMove % 2 === 0 ? 'Player 1 wins!' : 'Player 2 wins!'
  if (turnBeforeMove % 2 === 0) return role === 'host' ? 'You win!' : 'Friend wins!'
  return role === 'guest' ? 'You win!' : 'Friend wins!'
}

export default function WordLadder({ mode, session, peerAway = false, onExit }: GameProps) {
  const isRemote = mode === 'remote'
  const isPassAndPlay = mode === 'pass-and-play'
  const isSolo = mode === 'single'

  const initialIndex = useRef(Math.floor(Math.random() * LADDER_PUZZLES.length)).current
  const initialPuzzle = puzzleByIndex(initialIndex)

  const [start, setStart] = useState(initialPuzzle.start)
  const [end, setEnd] = useState(initialPuzzle.end)
  const [chain, setChain] = useState<string[]>(() => [initialPuzzle.start])
  const [input, setInput] = useState('')
  const [message, setMessage] = useState('')
  const [turn, setTurn] = useState(0)
  const [winner, setWinner] = useState<string | null>(null)
  const startTime = useRef(Date.now())
  const gameId = 'word-ladder'
  const hostInitRef = useRef(false)

  const wordLen = start.length

  const currentPlayerLabel = useMemo(() => {
    if (winner) return winner
    if (isSolo) return 'Your turn'
    if (isRemote) {
      const isHostTurn = turn % 2 === 0
      if (session?.role === 'host') return isHostTurn ? 'Your turn' : "Friend's turn"
      return isHostTurn ? "Friend's turn" : 'Your turn'
    }
    return turn % 2 === 0 ? 'Player 1' : 'Player 2'
  }, [winner, isSolo, isRemote, turn, session?.role])

  const isMyTurn = useMemo(() => {
    if (winner || peerAway) return false
    if (isSolo) return true
    if (isRemote) {
      const isHostTurn = turn % 2 === 0
      return session?.role === 'host' ? isHostTurn : !isHostTurn
    }
    return true
  }, [winner, peerAway, isSolo, isRemote, turn, session?.role])

  const finishGame = useCallback(
    (winText: string, won: boolean) => {
      setWinner(winText)
      stats.recordPlay(gameId, Date.now() - startTime.current)
      stats.recordResult(gameId, won ? 'win' : 'loss')
    },
    [],
  )

  const applyStep = useCallback(
    (word: string, nextChain: string[], turnBeforeMove: number) => {
      setChain(nextChain)
      setInput('')
      setMessage('')
      setTurn(turnBeforeMove + 1)

      if (word !== end) return

      const winText = moverLabel(mode, turnBeforeMove, session?.role ?? null)
      const youWon =
        isSolo ||
        isPassAndPlay ||
        (isRemote &&
          ((turnBeforeMove % 2 === 0 && session?.role === 'host') ||
            (turnBeforeMove % 2 === 1 && session?.role === 'guest')))

      finishGame(winText, youWon)
    },
    [end, mode, session?.role, isSolo, isPassAndPlay, isRemote, finishGame],
  )

  const submitWord = useCallback(() => {
    const word = input.trim().toUpperCase()
    const prev = chain[chain.length - 1]!

    if (!isMyTurn) return
    if (!word) return
    if (word.length !== wordLen) {
      setMessage(`Words must be ${wordLen} letters`)
      return
    }
    if (chain.includes(word)) {
      setMessage('Already used that word')
      return
    }
    if (!isValidLadderStep(prev, word, wordLen)) {
      setMessage('Change exactly one letter to a valid word')
      return
    }

    const nextChain = [...chain, word]
    if (isRemote && session) {
      session.send({ type: 'ladder:step', word, chain: nextChain } satisfies LadderMessage)
    }
    applyStep(word, nextChain, turn)
  }, [input, chain, wordLen, isMyTurn, isRemote, session, turn, applyStep])

  useEffect(() => {
    if (!isRemote || !session || session.role !== 'host' || hostInitRef.current) return
    hostInitRef.current = true
    session.send({
      type: 'ladder:start',
      start: initialPuzzle.start,
      end: initialPuzzle.end,
      puzzleIndex: initialIndex,
    } satisfies LadderMessage)
  }, [isRemote, session, initialPuzzle.start, initialPuzzle.end, initialIndex])

  useEffect(() => {
    if (!session || !isRemote) return
    return session.onMessage((msg) => {
      const m = msg as LadderMessage
      if (m.type === 'ladder:start') {
        setStart(m.start)
        setEnd(m.end)
        setChain([m.start])
        setTurn(0)
        setWinner(null)
        setMessage('')
      }
      if (m.type === 'ladder:step') {
        applyStep(m.word, m.chain, m.chain.length - 2)
      }
      if (m.type === 'ladder:new') {
        setStart(m.start)
        setEnd(m.end)
        setChain([m.start])
        setTurn(0)
        setWinner(null)
        setMessage('')
        setInput('')
        startTime.current = Date.now()
      }
    })
  }, [session, isRemote, applyStep])

  const newPuzzle = () => {
    const idx = Math.floor(Math.random() * LADDER_PUZZLES.length)
    const puzzle = puzzleByIndex(idx)
    setStart(puzzle.start)
    setEnd(puzzle.end)
    setChain([puzzle.start])
    setTurn(0)
    setWinner(null)
    setMessage('')
    setInput('')
    startTime.current = Date.now()

    if (isRemote && session?.role === 'host') {
      session.send({
        type: 'ladder:new',
        puzzleIndex: idx,
        start: puzzle.start,
        end: puzzle.end,
      } satisfies LadderMessage)
    }
  }

  const statusText = () => {
    if (peerAway && !winner) return 'Friend stepped away — puzzle saved.'
    if (isRemote && !session?.isConnected && !winner) return 'Connecting…'
    if (winner) return winner
    return `${currentPlayerLabel} — change one letter`
  }

  return (
    <div className="wl">
      <div className="wl__goal">
        <span className="wl__label">Start</span>
        <span className="wl__word">{start}</span>
        <span className="wl__arrow" aria-hidden>
          →
        </span>
        <span className="wl__label">End</span>
        <span className="wl__word">{end}</span>
      </div>

      <p className="wl__status">{statusText()}</p>

      <ol className="wl__chain" aria-label="Word ladder chain">
        {chain.map((word, i) => (
          <li key={`${word}-${i}`} className={i === chain.length - 1 ? 'current' : ''}>
            {word}
          </li>
        ))}
      </ol>

      {!winner && (
        <div className="wl__input-row">
          <input
            className="input wl__input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, wordLen))}
            onKeyDown={(e) => e.key === 'Enter' && submitWord()}
            placeholder={`${wordLen}-letter word`}
            disabled={!isMyTurn}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={wordLen}
          />
          <button type="button" className="btn wl__submit" onClick={submitWord} disabled={!isMyTurn}>
            Add
          </button>
        </div>
      )}

      {message && <p className="wl__error">{message}</p>}

      <div className="wl__actions">
        <button type="button" className="btn" onClick={newPuzzle}>
          New Ladder
        </button>
        {winner && (
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Menu
          </button>
        )}
      </div>
    </div>
  )
}
