import { useNavigate } from 'react-router-dom'
import { acceptAsyncInvite, dismissAsyncInvite } from '../lib/friends/invites'
import type { AsyncMatchInvite } from '../lib/friends/types'
import { getGameById } from '../games/registry'
import LoadingSpinner from './LoadingSpinner'
import './Friends.css'

interface AsyncInviteListProps {
  invites: AsyncMatchInvite[]
  loading?: boolean
  onChanged: () => void
  onContinue?: () => void
}

export default function AsyncInviteList({
  invites,
  loading = false,
  onChanged,
  onContinue,
}: AsyncInviteListProps) {
  const navigate = useNavigate()

  if (loading) return <LoadingSpinner className="loading-spinner--panel" />
  if (invites.length === 0) return null

  const handleAccept = async (invite: AsyncMatchInvite) => {
    try {
      const matchId = await acceptAsyncInvite(invite.inviteId)
      onChanged()
      onContinue?.()
      navigate(`/play/${invite.gameId}`, { state: { mode: 'async', matchId } })
    } catch (e) {
      console.warn('[async-invite] accept failed', e)
    }
  }

  const handleDismiss = async (inviteId: string) => {
    try {
      await dismissAsyncInvite(inviteId)
      onChanged()
    } catch (e) {
      console.warn('[async-invite] dismiss failed', e)
    }
  }

  return (
    <ul className="friends-list">
      {invites.map((inv) => {
        const game = getGameById(inv.gameId)
        return (
          <li key={inv.inviteId} className="friends-list__row friends-list__row--invite">
            <div className="friends-list__info">
              <span className="friends-list__name">
                {inv.fromUsername} invited you to {game ? `${game.icon} ${game.name}` : inv.gameId}
              </span>
            </div>
            <div className="friends-list__actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void handleAccept(inv)}
              >
                Play
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handleDismiss(inv.inviteId)}
              >
                Dismiss
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
