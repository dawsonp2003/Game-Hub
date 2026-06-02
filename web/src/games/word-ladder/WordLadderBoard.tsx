import { useCallback, useState } from 'react'
import { isValidLadderStep } from '../../lib/words'
import type { LadderRoundSummary } from './word-ladder-match'
import './WordLadder.css'

interface WordLadderBoardProps {
  start: string
  end: string
  allowAnyWord?: boolean
  statusHint?: string
  disabled?: boolean
  onStep?: (stepCount: number) => void
  onComplete: (result: LadderRoundSummary) => void
}

export default function WordLadderBoard({
  start,
  end,
  allowAnyWord = true,
  statusHint,
  disabled = false,
  onStep,
  onComplete,
}: WordLadderBoardProps) {
  const [chain, setChain] = useState<string[]>(() => [start])
  const [input, setInput] = useState('')
  const [message, setMessage] = useState('')
  const [finished, setFinished] = useState(false)

  const wordLen = start.length

  const submitWord = useCallback(() => {
    const word = input.trim().toUpperCase()
    const prev = chain[chain.length - 1]!

    if (disabled || finished) return
    if (!word) return
    if (word.length !== wordLen) {
      setMessage(`Words must be ${wordLen} letters`)
      return
    }
    if (chain.includes(word)) {
      setMessage('Already used that word')
      return
    }
    if (!isValidLadderStep(prev, word, wordLen, allowAnyWord)) {
      setMessage(
        allowAnyWord
          ? 'Change exactly one letter'
          : 'Change exactly one letter to a valid word',
      )
      return
    }

    const nextChain = [...chain, word]
    const stepCount = nextChain.length - 1
    setChain(nextChain)
    setInput('')
    setMessage('')
    onStep?.(stepCount)

    if (word === end) {
      setFinished(true)
      onComplete({ finished: true, stepCount, start, end })
    }
  }, [allowAnyWord, chain, disabled, end, finished, input, onComplete, onStep, start, wordLen])

  const giveUp = () => {
    if (finished || disabled) return
    setFinished(true)
    onComplete({ finished: false, stepCount: chain.length - 1, start, end })
  }

  const statusText = () => {
    if (finished && chain[chain.length - 1] === end) return 'You reached the end!'
    if (finished) return 'Round over'
    return message || statusHint || 'Change one letter at a time'
  }

  return (
    <>
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

      {!finished && (
        <>
          <div className="wl__input-row">
            <input
              className="input wl__input"
              type="text"
              value={input}
              onChange={(e) =>
                setInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, wordLen))
              }
              onKeyDown={(e) => e.key === 'Enter' && submitWord()}
              placeholder={`${wordLen}-letter word`}
              disabled={disabled}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={wordLen}
            />
            <button type="button" className="btn wl__submit" onClick={submitWord} disabled={disabled}>
              Add
            </button>
          </div>
          <button type="button" className="btn btn-secondary wl__give-up" onClick={giveUp} disabled={disabled}>
            Give up
          </button>
        </>
      )}
    </>
  )
}
