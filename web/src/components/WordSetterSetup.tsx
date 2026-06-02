import { useState } from 'react'
import type { GameMode } from '../lib/multiplayer/types'
import type { MultiplayerSession } from '../lib/multiplayer/session'
import {
  isValidSecretWord,
  normalizeSecretWord,
  setterLabel,
  wordGameSetterRole,
} from '../lib/words/word-game-setup'
import './WordSetterSetup.css'

interface WordSetterSetupProps {
  mode: GameMode
  session: MultiplayerSession | null
  minLen?: number
  maxLen?: number
  placeholder?: string
  hint?: string
  /** Second field for word ladder start word */
  secondField?: { label: string; placeholder: string }
  /** Remote head-to-head: both players enter a word (no host-only gate). */
  bothEnterWord?: boolean
  onConfirm: (word: string, second?: string) => void
  waiting?: boolean
}

export default function WordSetterSetup({
  mode,
  session,
  minLen = 2,
  maxLen = 16,
  placeholder = 'Secret word',
  hint,
  secondField,
  bothEnterWord = false,
  onConfirm,
  waiting = false,
}: WordSetterSetupProps) {
  const [word, setWord] = useState('')
  const [second, setSecond] = useState('')
  const [error, setError] = useState('')

  const role = wordGameSetterRole(mode, session?.role ?? null)
  const isSetter = role === 'setter'
  const showWaiting = waiting || (mode === 'remote' && !isSetter && !bothEnterWord)

  const submit = () => {
    const primary = normalizeSecretWord(word)
    const extra = secondField ? normalizeSecretWord(second) : undefined

    if (!isValidSecretWord(primary, minLen, maxLen)) {
      setError(`Word must be ${minLen}–${maxLen} letters`)
      return
    }
    if (secondField) {
      if (!isValidSecretWord(extra!, minLen, maxLen)) {
        setError(`Both words must be ${minLen}–${maxLen} letters`)
        return
      }
      if (primary.length !== extra!.length) {
        setError('Start and end must be the same length')
        return
      }
      if (primary === extra) {
        setError('Start and end must be different')
        return
      }
    }

    setError('')
    setWord('')
    setSecond('')
    onConfirm(primary, extra)
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
    <div className="wset">
      <p className="wset__title">{hint ?? setterLabel(mode, session?.role ?? null)}</p>
      <p className="wset__muted">Any letters A–Z; dictionary not required.</p>

      {secondField && (
        <>
          <label className="wset__label">{secondField.label}</label>
          <input
            className="input wset__input"
            value={second}
            onChange={(e) => setSecond(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, maxLen))}
            placeholder={secondField.placeholder}
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={maxLen}
          />
        </>
      )}

      <label className="wset__label">{secondField ? 'End word' : 'Secret word'}</label>
      <input
        className="input wset__input"
        value={word}
        onChange={(e) => setWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, maxLen))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={maxLen}
      />

      {error && <p className="wset__error">{error}</p>}

      <button type="button" className="btn wset__btn" onClick={submit}>
        {mode === 'pass-and-play' ? 'Hide & pass device' : 'Send to friend'}
      </button>
    </div>
  )
}
