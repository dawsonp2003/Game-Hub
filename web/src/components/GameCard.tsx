import { useNavigate } from 'react-router-dom'
import { useRoom } from '../context/RoomContext'
import type { GameDef } from '../games/types'
import './GameCard.css'

interface GameCardProps {
  game: GameDef
}

export default function GameCard({ game }: GameCardProps) {
  const navigate = useNavigate()
  const room = useRoom()
  const supportsRemote = game.modes.includes('remote')

  const handleClick = () => {
    navigate(`/game/${game.id}`)
  }

  const inRoomMultiplayer = room.isInRoom && supportsRemote

  return (
    <button type="button" className="game-card" onClick={handleClick}>
      <span className="game-card__icon" aria-hidden>
        {game.icon}
      </span>
      <span className="game-card__name">{game.name}</span>
      {game.status === 'wip' && <span className="game-card__badge">Soon</span>}
      {inRoomMultiplayer && !room.isPlayReady && (
        <span className="game-card__action game-card__action--muted">Connect first</span>
      )}
    </button>
  )
}
