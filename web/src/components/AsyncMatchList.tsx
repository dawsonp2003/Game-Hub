import { useNavigate } from 'react-router-dom'
import { buildAsyncJoinUrl } from '../lib/async/matches'
import type { AsyncMatchSummary } from '../lib/async/types'
import { getGameById } from '../games/registry'
import './AsyncMatchPanel.css'

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

interface AsyncMatchListProps {
  matches: AsyncMatchSummary[]
  gameId?: string
  loading?: boolean
  emptyMessage?: string
  showGameName?: boolean
  onDelete?: (matchId: string) => void
  deleteBusy?: boolean
  onContinue?: () => void
}

export default function AsyncMatchList({
  matches,
  gameId,
  loading = false,
  emptyMessage = 'No in-progress async games.',
  showGameName = false,
  onDelete,
  deleteBusy = false,
  onContinue,
}: AsyncMatchListProps) {
  const navigate = useNavigate()

  const handleContinue = (match: AsyncMatchSummary) => {
    onContinue?.()
    navigate(`/play/${match.gameId}`, {
      state: {
        mode: 'async',
        matchId: match.id,
        fromAccount: Boolean(onContinue),
      },
    })
  }

  if (loading) {
    return <p className="async-panel__muted">Loading…</p>
  }

  if (matches.length === 0) {
    return <p className="async-panel__muted">{emptyMessage}</p>
  }

  return (
    <ul className="async-panel__list">
      {matches.map((m) => {
        const game = showGameName ? getGameById(m.gameId) : gameId ? getGameById(gameId) : null
        const statusLabel = m.isMyTurn
          ? 'Your turn'
          : m.status === 'waiting'
            ? `Waiting for friend${m.joinCode ? ` · ${m.joinCode}` : ''}`
            : "Opponent's turn"

        return (
          <li
            key={m.id}
            className={`async-panel__row${m.isMyTurn ? ' async-panel__row--your-turn' : ''}`}
          >
            <div className="async-panel__row-main">
              {showGameName && game && (
                <span className="async-panel__game">
                  <span aria-hidden>{game.icon}</span> {game.name}
                </span>
              )}
              <span className="async-panel__status">
                {m.isMyTurn && <span className="async-panel__turn-dot" aria-hidden />}
                {statusLabel}
              </span>
              <span className="async-panel__meta">{formatRelative(m.lastMoveAt)}</span>
            </div>
            <div className="async-panel__row-actions">
              {(m.status === 'active' || (m.status === 'waiting' && m.isMyTurn)) && (
                <button type="button" className="btn btn-sm" onClick={() => handleContinue(m)}>
                  Continue
                </button>
              )}
              {m.status === 'waiting' && m.joinCode && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void navigator.clipboard.writeText(buildAsyncJoinUrl(m.joinCode!))}
                >
                  Share
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onDelete(m.id)}
                  disabled={deleteBusy}
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
