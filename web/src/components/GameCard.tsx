import { useNavigate } from 'react-router-dom'
import { useRoom } from '../context/RoomContext'
import type { GameDef } from '../games/types'
import { useAsyncNotificationsContext } from '../context/AsyncNotificationsContext'
import './GameCard.css'

interface GameCardProps {
  game: GameDef
}

export default function GameCard({ game }: GameCardProps) {
  const navigate = useNavigate()
  const room = useRoom()
  const { turnByGame } = useAsyncNotificationsContext()
  const supportsRemote = game.modes.includes('remote')
  const asyncTurns = turnByGame[game.id] ?? 0

  const handleClick = () => {
    navigate(`/game/${game.id}`, {
      state: asyncTurns > 0 ? { preferAsync: true } : undefined,
    })
  }

  const inRoomMultiplayer = room.isInRoom && supportsRemote

  return (
    <button type="button" className="game-card" onClick={handleClick}>
      <span className="game-card__icon-wrap">
        <span className="game-card__icon" aria-hidden>
          {game.icon}
        </span>
        {asyncTurns > 0 && (
          <span
            className="game-card__async-badge"
            aria-label={`${asyncTurns} async game${asyncTurns === 1 ? '' : 's'} waiting for your turn`}
          >
            {asyncTurns > 9 ? '9+' : asyncTurns}
          </span>
        )}
      </span>
      <span className="game-card__name">{game.name}</span>
      {game.status === 'wip' && <span className="game-card__badge">Soon</span>}
      {inRoomMultiplayer && !room.isPlayReady && (
        <span className="game-card__action game-card__action--muted">Connect first</span>
      )}
    </button>
  )
}
