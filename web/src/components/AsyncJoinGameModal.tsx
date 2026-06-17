import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAsyncCodeFromUrl, joinAsyncMatchFromCode } from '../lib/async/matches'
import { takePendingAsyncCode } from './AsyncLinkJoiner'
import './AsyncNewGameModal.css'

interface AsyncJoinGameModalProps {
  gameId: string
  initialCode?: string
  onClose: () => void
}

export default function AsyncJoinGameModal({
  gameId,
  initialCode = '',
  onClose,
}: AsyncJoinGameModalProps) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState(initialCode)
  const autoJoinedRef = useRef(false)

  useEffect(() => {
    setJoinCode(initialCode)
  }, [initialCode])

  const handleJoin = async () => {
    setBusy(true)
    setError(null)
    try {
      const { matchId, gameId: joinedGameId } = await joinAsyncMatchFromCode(joinCode)
      if (joinedGameId !== gameId) {
        setError('That code is for a different game.')
        return
      }
      clearAsyncCodeFromUrl()
      takePendingAsyncCode()
      onClose()
      navigate(`/play/${gameId}`, { state: { mode: 'async', matchId } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join game')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (autoJoinedRef.current || initialCode.length !== 6) return
    autoJoinedRef.current = true
    void handleJoin()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot auto-join from invite link
  }, [initialCode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="async-new-modal" role="presentation">
      <button
        type="button"
        className="async-new-modal__backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="async-new-modal__dialog" role="dialog" aria-modal="true" aria-label="Join async game">
        <h2 className="async-new-modal__title">Join async game</h2>
        <p className="async-new-modal__hint">Enter the 6-digit code your friend shared.</p>

        {error && <p className="async-new-modal__error">{error}</p>}

        <div className="async-new-modal__join">
          <input
            className="async-new-modal__join-input input"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            aria-label="Join code"
            autoFocus
          />
          <button
            type="button"
            className="btn"
            onClick={() => void handleJoin()}
            disabled={busy || joinCode.length !== 6}
          >
            {busy ? 'Joining…' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  )
}
