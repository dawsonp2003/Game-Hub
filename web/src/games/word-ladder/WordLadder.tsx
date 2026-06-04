import { useCallback, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { useVictoryConfetti } from '../../hooks/useVictoryConfetti'
import { recordGameEnd } from '../../lib/stats'
import { isValidLadderStep, pickRandomLadderPuzzle } from '../../lib/words'
import WordLadderPassAndPlay from './WordLadderPassAndPlay'
import WordLadderRemote from './WordLadderRemote'
import './WordLadder.css'

export default function WordLadder({ mode, session, peerAway = false, onExit }: GameProps) {
  if (mode === 'pass-and-play') {
    return <WordLadderPassAndPlay onExit={onExit} />
  }

  if (mode === 'remote') {
    return <WordLadderRemote session={session} peerAway={peerAway} onExit={onExit} />
  }

  const initialPuzzle = pickRandomLadderPuzzle()
  const [start, setStart] = useState(initialPuzzle.start)
  const [end, setEnd] = useState(initialPuzzle.end)
  const [chain, setChain] = useState<string[]>(() => [initialPuzzle.start])
  const [input, setInput] = useState('')
  const [message, setMessage] = useState('')
  const [winner, setWinner] = useState<string | null>(null)
  const startTime = useRef(Date.now())
  const gameId = 'word-ladder'

  useVictoryConfetti(winner ?? '')

  const wordLen = start.length

  const submitWord = useCallback(() => {
    const word = input.trim().toUpperCase()
    const prev = chain[chain.length - 1]!

    if (!word) return
    if (word.length !== wordLen) {
      setMessage(`Words must be ${wordLen} letters`)
      return
    }
    if (chain.includes(word)) {
      setMessage('Already used that word')
      return
    }
    if (!isValidLadderStep(prev, word, wordLen, false)) {
      setMessage('Change exactly one letter to a valid word')
      return
    }

    const nextChain = [...chain, word]
    setChain(nextChain)
    setInput('')
    setMessage('')

    if (word === end) {
      setWinner('You win!')
      recordGameEnd({
        gameId,
        mode,
        result: 'win',
        durationMs: Date.now() - startTime.current,
        turns: nextChain.length - 1,
        startedAt: startTime.current,
      })
    }
  }, [chain, end, input, wordLen, mode])

  const newPuzzle = () => {
    const puzzle = pickRandomLadderPuzzle()
    setStart(puzzle.start)
    setEnd(puzzle.end)
    setChain([puzzle.start])
    setWinner(null)
    setMessage('')
    setInput('')
    startTime.current = Date.now()
  }

  const statusText = () => {
    if (peerAway && !winner) return 'Friend stepped away — puzzle saved.'
    if (winner) return winner
    return 'Change one letter at a time'
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
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={wordLen}
          />
          <button type="button" className="btn wl__submit" onClick={submitWord}>
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
