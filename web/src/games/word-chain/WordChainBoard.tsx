import { useCallback, useState } from 'react'
import { CHAIN_LENGTH, CHAIN_MAX_WORD_LEN } from './word-chain-constants'
import type { ChainRoundSummary } from './word-chain-match'
import './WordChain.css'

/** Show first `lettersRevealed` letters; rest as dots. */
function maskWord(word: string, lettersRevealed: number): string {
  const n = Math.min(Math.max(lettersRevealed, 1), word.length)
  return word
    .split('')
    .map((ch, i) => (i < n ? ch : '·'))
    .join('')
}

interface WordChainBoardProps {
  chain: string[]
  statusHint?: string
  disabled?: boolean
  onProgress?: (summary: Pick<ChainRoundSummary, 'mistakes' | 'revealedCount'>) => void
  onComplete: (result: ChainRoundSummary) => void
}

export default function WordChainBoard({
  chain,
  statusHint,
  disabled = false,
  onProgress,
  onComplete,
}: WordChainBoardProps) {
  const [revealedCount, setRevealedCount] = useState(1)
  const [mistakes, setMistakes] = useState(0)
  /** Letters revealed on the word currently being guessed (always at least 1). */
  const [hintLettersOnCurrent, setHintLettersOnCurrent] = useState(1)
  const [input, setInput] = useState('')
  const [message, setMessage] = useState('')
  const [finished, setFinished] = useState(false)

  const words = chain.slice(0, CHAIN_LENGTH)
  const guessingIndex = revealedCount
  const currentWord = guessingIndex < words.length ? words[guessingIndex]! : ''
  const canRevealMoreHints =
    !!currentWord && hintLettersOnCurrent < currentWord.length

  const emitProgress = useCallback(
    (nextRevealed: number, nextMistakes: number) => {
      onProgress?.({ revealedCount: nextRevealed, mistakes: nextMistakes })
    },
    [onProgress],
  )

  const finish = useCallback(
    (nextRevealed: number, nextMistakes: number, done: boolean) => {
      setFinished(true)
      onComplete({
        finished: done,
        mistakes: nextMistakes,
        revealedCount: nextRevealed,
      })
    },
    [onComplete],
  )

  const submitGuess = useCallback(() => {
    if (disabled || finished || guessingIndex >= words.length) return

    const guess = input.trim().toUpperCase()
    const answer = words[guessingIndex]!

    if (!guess) return

    if (guess === answer) {
      const nextRevealed = revealedCount + 1
      setRevealedCount(nextRevealed)
      setHintLettersOnCurrent(1)
      setInput('')
      setMessage('')

      if (nextRevealed >= words.length) {
        finish(nextRevealed, mistakes, true)
      } else {
        emitProgress(nextRevealed, mistakes)
      }
      return
    }

    const nextMistakes = mistakes + 1
    setMistakes(nextMistakes)
    setMessage(`Not quite — try the word that follows ${words[guessingIndex - 1]}`)
    emitProgress(revealedCount, nextMistakes)
  }, [
    disabled,
    finished,
    guessingIndex,
    input,
    words,
    revealedCount,
    mistakes,
    finish,
    emitProgress,
  ])

  const useHint = useCallback(() => {
    if (disabled || finished || guessingIndex >= words.length || !canRevealMoreHints) return

    const nextHints = hintLettersOnCurrent + 1
    const nextMistakes = mistakes + 1
    const letter = currentWord[nextHints - 1]!

    setHintLettersOnCurrent(nextHints)
    setMistakes(nextMistakes)
    setMessage(`Hint: letter ${nextHints} is “${letter}” (+1 mistake)`)
    emitProgress(revealedCount, nextMistakes)
  }, [
    disabled,
    finished,
    guessingIndex,
    words.length,
    canRevealMoreHints,
    hintLettersOnCurrent,
    mistakes,
    currentWord,
    emitProgress,
    revealedCount,
  ])

  const giveUp = () => {
    if (finished || disabled) return
    finish(revealedCount, mistakes, false)
  }

  const hintLetters = words
    .map((w, i) => (i === 0 || i < revealedCount ? null : w[0]))
    .filter((c): c is string => !!c)

  const statusText = () => {
    if (finished && revealedCount >= words.length) return 'Chain complete!'
    if (finished) return 'Round over'
    return message || statusHint || 'Guess the next word in the chain'
  }

  return (
    <>
      <p className="wch__status">{statusText()}</p>
      <p className="wch__mistakes">
        Mistakes: <strong>{mistakes}</strong>
      </p>

      {hintLetters.length > 0 && (
        <p className="wch__letter-hints" aria-label="First letters of upcoming words">
          Upcoming letters: {hintLetters.join(' · ')}
        </p>
      )}

      <ol className="wch__chain" aria-label="Word chain progress">
        {words.map((word, i) => {
          const revealed = i < revealedCount
          const isCurrent = i === guessingIndex && !finished
          const prev = i > 0 ? words[i - 1] : null

          return (
            <li
              key={`${word}-${i}`}
              className={`wch__chain-item ${revealed ? 'wch__chain-item--revealed' : ''} ${isCurrent ? 'wch__chain-item--current' : ''}`}
            >
              <span className="wch__chain-index">{i + 1}</span>
              <span className="wch__chain-word">
                {revealed
                  ? word
                  : isCurrent
                    ? maskWord(word, hintLettersOnCurrent)
                    : `${word[0]}${'·'.repeat(Math.max(word.length - 1, 2))}`}
              </span>
              {i > 0 && prev && revealed && (
                <span className="wch__chain-compound">
                  {prev.toLowerCase()}
                  {word.toLowerCase()}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {!finished && guessingIndex < words.length && (
        <>
          <p className="wch__prompt">
            Word after <strong>{words[guessingIndex - 1]}</strong>
          </p>
          <p className="wch__current-mask" aria-live="polite">
            {maskWord(currentWord, hintLettersOnCurrent)}
          </p>
          <div className="wch__input-row">
            <input
              className="input wch__input"
              type="text"
              value={input}
              onChange={(e) =>
                setInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CHAIN_MAX_WORD_LEN))
              }
              onKeyDown={(e) => e.key === 'Enter' && submitGuess()}
              placeholder="Next word"
              disabled={disabled}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={CHAIN_MAX_WORD_LEN}
            />
            <button type="button" className="btn wch__submit" onClick={submitGuess} disabled={disabled}>
              Guess
            </button>
          </div>
          <div className="wch__secondary-actions">
            <button
              type="button"
              className="btn btn-secondary wch__hint"
              onClick={useHint}
              disabled={disabled || !canRevealMoreHints}
            >
              Hint (+1 mistake)
            </button>
            <button type="button" className="btn btn-secondary wch__give-up" onClick={giveUp} disabled={disabled}>
              Give up
            </button>
          </div>
        </>
      )}
    </>
  )
}
