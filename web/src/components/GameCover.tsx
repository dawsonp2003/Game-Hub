import { useState } from 'react'
import type { GameDef } from '../games/types'

export default function GameCover({ game }: { game: GameDef }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = game.image && !imageFailed

  return (
    <div className="game-info__art">
      {showImage ? (
        <img
          src={game.image}
          alt=""
          className="game-info__art-img"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="game-info__art-icon" aria-hidden>
          {game.icon}
        </span>
      )}
    </div>
  )
}
