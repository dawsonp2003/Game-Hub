import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildAsyncJoinUrl, createAsyncMatch } from '../lib/async/matches'
import { listFriends } from '../lib/friends/friends'
import { inviteFriendToAsyncMatch } from '../lib/friends/invites'
import type { Friend } from '../lib/friends/types'
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
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedFriendId, setSelectedFriendId] = useState('')
  const [inviteSent, setInviteSent] = useState(false)

  const atCap = activeCount >= MAX_PER_GAME

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    void listFriends()
      .then(setFriends)
      .catch(() => setFriends([]))
  }, [])

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

  const handleSendToFriend = async () => {
    if (!createdMatchId || !selectedFriendId) return
    setBusy(true)
    setError(null)
    try {
      await inviteFriendToAsyncMatch(createdMatchId, selectedFriendId)
      setInviteSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send invite')
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

            {friends.length > 0 && (
              <>
                <p className="async-new-modal__divider">or send to a friend</p>
                <select
                  className="async-new-modal__friend-select"
                  value={selectedFriendId}
                  onChange={(e) => setSelectedFriendId(e.target.value)}
                  disabled={busy || inviteSent}
                >
                  <option value="">Choose a friend…</option>
                  {friends.map((f) => (
                    <option key={f.userId} value={f.userId}>
                      {f.username}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || !selectedFriendId || inviteSent}
                  onClick={() => void handleSendToFriend()}
                >
                  {inviteSent ? 'Invite sent!' : busy ? 'Sending…' : 'Send to friend'}
                </button>
              </>
            )}

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
