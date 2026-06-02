import { useState } from 'react'
import type { GameMode } from '../../lib/multiplayer/types'
import type { MultiplayerSession } from '../../lib/multiplayer/session'
import { normalizeSecretWord, setterLabel, wordGameSetterRole } from '../../lib/words/word-game-setup'
import { CHAIN_LENGTH, CHAIN_MAX_WORD_LEN, CHAIN_MIN_WORD_LEN } from './word-chain-constants'
import '../../components/WordSetterSetup.css'
import './WordChain.css'

function isValidChainWord(word: string): boolean {
  return word.length >= CHAIN_MIN_WORD_LEN && word.length <= CHAIN_MAX_WORD_LEN
}

interface ChainSetterSetupProps {
  mode: GameMode
  session: MultiplayerSession | null
  hint?: string
  bothEnterChain?: boolean
  onConfirm: (chain: string[]) => void
  waiting?: boolean
}

export default function ChainSetterSetup({
  mode,
  session,
  hint,
  bothEnterChain = false,
  onConfirm,
  waiting = false,
}: ChainSetterSetupProps) {
  const [words, setWords] = useState<string[]>(() => Array(CHAIN_LENGTH).fill(''))
  const [error, setError] = useState('')

  const role = wordGameSetterRole(mode, session?.role ?? null)
  const isSetter = role === 'setter'
  const showWaiting = waiting || (mode === 'remote' && !isSetter && !bothEnterChain)

  const setWordAt = (index: number, value: string) => {
    setWords((prev) => {
      const next = [...prev]
      next[index] = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CHAIN_MAX_WORD_LEN)
      return next
    })
  }

  const submit = () => {
    const chain = words.map((w) => normalizeSecretWord(w))
    for (let i = 0; i < chain.length; i++) {
      if (!isValidChainWord(chain[i]!)) {
        setError(`Word ${i + 1} must be ${CHAIN_MIN_WORD_LEN}–${CHAIN_MAX_WORD_LEN} letters`)
        return
      }
    }
    setError('')
    setWords(Array(CHAIN_LENGTH).fill(''))
    onConfirm(chain)
  }

  if (showWaiting) {
    return (
      <div className="wset">
        <p className="wset__status">{hint ?? setterLabel(mode, session?.role ?? null)}</p>
        {mode === 'remote' && !session?.isConnected && (
          <p className="wset__muted">Connecting…</p>
        )}
      </div>
    )
  }

  return (
    <div className="wset wch-set">
      <p className="wset__title">{hint ?? 'Build an 8-word chain for your opponent'}</p>
      <p className="wset__muted wch-set__explain">
        Each pair should form a familiar compound when read together — like GRAVE + YARD → graveyard,
        then YARD + STICK → yardstick, and so on.
      </p>

      <ol className="wch-set__list">
        {words.map((word, i) => (
          <li key={i}>
            <label className="wch-set__label" htmlFor={`wch-word-${i}`}>
              Word {i + 1}
              {i > 0 && words[i] && (
                <span className="wch-set__hint-letter"> (starts with {words[i]![0]})</span>
              )}
            </label>
            <input
              id={`wch-word-${i}`}
              className="input wset__input"
              value={word}
              onChange={(e) => setWordAt(i, e.target.value)}
              placeholder={i === 0 ? 'e.g. GRAVE' : `e.g. ${i === 1 ? 'YARD' : '…'}`}
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={CHAIN_MAX_WORD_LEN}
            />
            {i < CHAIN_LENGTH - 1 && word && (
              <p className="wch-set__pair-preview" aria-hidden>
                {word}
                {words[i + 1] ? ` + ${words[i + 1]} → ${word.toLowerCase()}${words[i + 1]!.toLowerCase()}` : ' + …'}
              </p>
            )}
          </li>
        ))}
      </ol>

      {error && <p className="wset__error">{error}</p>}

      <button type="button" className="btn wset__btn" onClick={submit}>
        {mode === 'pass-and-play' ? 'Hide & pass device' : 'Send chain to friend'}
      </button>
    </div>
  )
}
