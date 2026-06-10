import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildAsyncJoinUrl, createAsyncMatch } from '../lib/async/matches'
import './AsyncNewGameModal.css'

const MAX_PER_GAME = 3

interface AsyncCreateGameModalProps {
  gameId: string
  activeCount: number
  onCreated: () => void
  onClose: () => void
}

export default function AsyncCreateGameModal({
  gameId,
  activeCount,
  onCreated,
  onClose,
}: AsyncCreateGameModalProps) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null)

  const atCap = activeCount >= MAX_PER_GAME

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCreate = async () => {
    if (atCap) {
      setError(`You can have at most ${MAX_PER_GAME} async games for this title.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { matchId, joinCode: code } = await createAsyncMatch(gameId)
      setCreatedMatchId(matchId)
      setCreatedCode(code)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create game')
    } finally {
      setBusy(false)
    }
  }

  const handleStartPlaying = () => {
    if (!createdMatchId) return
    onClose()
    navigate(`/play/${gameId}`, { state: { mode: 'async', matchId: createdMatchId } })
  }

  return (
    <div className="async-new-modal" role="presentation">
      <button
        type="button"
        className="async-new-modal__backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="async-new-modal__dialog" role="dialog" aria-modal="true" aria-label="New async game">
        <h2 className="async-new-modal__title">New async game</h2>
        <p className="async-new-modal__hint">
          Create a game, make your first move, and share the invite when you&apos;re ready.
        </p>

        {error && <p className="async-new-modal__error">{error}</p>}

        {createdCode && createdMatchId ? (
          <div className="async-new-modal__code-box">
            <p className="async-new-modal__code-label">Share this code with your friend:</p>
            <p className="async-new-modal__code">{createdCode}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void navigator.clipboard.writeText(buildAsyncJoinUrl(createdCode))}
            >
              Copy invite link
            </button>
            <button type="button" className="btn" onClick={handleStartPlaying}>
              Start playing
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn async-new-modal__create"
            onClick={() => void handleCreate()}
            disabled={busy || atCap}
          >
            {busy ? 'Working…' : 'Create game'}
          </button>
        )}
      </div>
    </div>
  )
}
