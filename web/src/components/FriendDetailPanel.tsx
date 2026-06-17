import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAsyncMatch } from '../lib/async/matches'
import { getFriendH2H, removeFriend } from '../lib/friends/friends'
import { inviteFriendToAsyncMatch } from '../lib/friends/invites'
import type { Friend, FriendH2HGame } from '../lib/friends/types'
import { ASYNC_GAME_IDS } from '../lib/multiplayer/types'
import { getGameById } from '../games/registry'
import LoadingSpinner from './LoadingSpinner'
import './Friends.css'

interface FriendDetailPanelProps {
  friend: Friend
  onBack: () => void
  onChanged: () => void
}

function formatH2HLine(game: FriendH2HGame): string {
  const { myWins, myLosses, myDraws } = game
  if (myWins > myLosses) return `You lead ${myWins}–${myLosses}`
  if (myLosses > myWins) return `They lead ${myLosses}–${myWins}`
  if (myDraws > 0 && myWins === myLosses) return `Tied ${myWins}–${myLosses} (${myDraws} draws)`
  return myWins + myLosses + myDraws === 0 ? 'No games yet' : `Even ${myWins}–${myLosses}`
}

export default function FriendDetailPanel({ friend, onBack, onChanged }: FriendDetailPanelProps) {
  const navigate = useNavigate()
  const [h2h, setH2h] = useState<FriendH2HGame[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inviteGameId, setInviteGameId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    void getFriendH2H(friend.userId)
      .then((rows) => {
        if (active) setH2h(rows)
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load stats')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [friend.userId])

  const overall = h2h?.reduce(
    (acc, g) => ({
      myWins: acc.myWins + g.myWins,
      myLosses: acc.myLosses + g.myLosses,
      myDraws: acc.myDraws + g.myDraws,
      totalGames: acc.totalGames + g.totalGames,
    }),
    { myWins: 0, myLosses: 0, myDraws: 0, totalGames: 0 },
  )

  const handleRemove = async () => {
    if (!window.confirm(`Remove ${friend.username} from your friends?`)) return
    setBusy(true)
    setError(null)
    try {
      await removeFriend(friend.userId)
      onChanged()
      onBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove friend')
    } finally {
      setBusy(false)
    }
  }

  const handleInvite = async (gameId: string) => {
    setInviteGameId(gameId)
    setBusy(true)
    setError(null)
    try {
      const { matchId } = await createAsyncMatch(gameId)
      await inviteFriendToAsyncMatch(matchId, friend.userId)
      onChanged()
      navigate(`/play/${gameId}`, { state: { mode: 'async', matchId } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send invite')
      setInviteGameId(null)
    } finally {
      setBusy(false)
    }
  }

  const memberSince = new Date(friend.friendsSince).toLocaleDateString()
  const asyncGames = [...ASYNC_GAME_IDS]

  if (loading) {
    return (
      <div className="friends-detail">
        <button type="button" className="friends-detail__back" onClick={onBack}>
          ← Back
        </button>
        <LoadingSpinner label="Loading stats…" className="loading-spinner--tab" />
      </div>
    )
  }

  return (
    <div className="friends-detail">
      <button type="button" className="friends-detail__back" onClick={onBack}>
        ← Back
      </button>
      <h3 className="friends-detail__name">{friend.username}</h3>
      <p className="friends-detail__meta">Friends since {memberSince}</p>

      {error && <p className="account-error">{error}</p>}

      <section className="friends-detail__section">
        <h4 className="account-section__title">Head-to-head</h4>
        {overall && overall.totalGames > 0 ? (
          <p className="friends-detail__overall">
            Overall: {overall.myWins}W – {overall.myLosses}L
            {overall.myDraws > 0 ? ` – ${overall.myDraws}D` : ''}
          </p>
        ) : (
          <p className="account-panel__subtitle">No games played together yet.</p>
        )}
        {h2h && h2h.length > 0 && (
          <ul className="friends-h2h">
            {h2h.map((g) => {
              const game = getGameById(g.gameId)
              return (
                <li key={g.gameId} className="friends-h2h__row">
                  <span>{game ? `${game.icon} ${game.name}` : g.gameId}</span>
                  <span className="friends-h2h__score">{formatH2HLine(g)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="friends-detail__section">
        <h4 className="account-section__title">Invite to game</h4>
        <div className="friends-invite-games">
          {asyncGames.map((gameId) => {
            const game = getGameById(gameId)
            return (
              <button
                key={gameId}
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => void handleInvite(gameId)}
              >
                {busy && inviteGameId === gameId ? 'Sending…' : game ? `${game.icon} ${game.name}` : gameId}
              </button>
            )
          })}
        </div>
      </section>

      <button
        type="button"
        className="btn btn-secondary friends-detail__remove"
        disabled={busy}
        onClick={() => void handleRemove()}
      >
        Remove friend
      </button>
    </div>
  )
}
