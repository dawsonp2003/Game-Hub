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
    if (room.isInRoom && room.isPlayReady && supportsRemote) {
      if (room.role === 'host') {
        room.launchGame(game.id)
        return
      }
      if (room.role === 'guest') {
        room.suggestGame(game.id)
        return
      }
    }

    navigate(`/play/${game.id}`)
  }

  const inRoomMultiplayer = room.isInRoom && supportsRemote
  const isHostPick = inRoomMultiplayer && room.role === 'host' && room.isPlayReady
  const isGuestSuggest = inRoomMultiplayer && room.role === 'guest' && room.isPlayReady

  return (
    <button type="button" className="game-card" onClick={handleClick}>
      <span className="game-card__icon" aria-hidden>
        {game.icon}
      </span>
      <span className="game-card__name">{game.name}</span>
      {game.status === 'wip' && <span className="game-card__badge">Soon</span>}
      {isHostPick && <span className="game-card__action">Play</span>}
      {isGuestSuggest && <span className="game-card__action game-card__action--suggest">Suggest</span>}
      {inRoomMultiplayer && !room.isPlayReady && (
        <span className="game-card__action game-card__action--muted">Connect first</span>
      )}
    </button>
  )
}
