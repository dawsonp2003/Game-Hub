import { Link } from 'react-router-dom'
import type { GameDef } from '../games/types'
import './GameCard.css'

interface GameCardProps {
  game: GameDef
}

export default function GameCard({ game }: GameCardProps) {
  return (
    <Link to={`/play/${game.id}`} className="game-card">
      <span className="game-card__icon" aria-hidden>
        {game.icon}
      </span>
      <span className="game-card__name">{game.name}</span>
      {game.status === 'wip' && <span className="game-card__badge">Soon</span>}
    </Link>
  )
}
