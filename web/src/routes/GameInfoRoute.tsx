import { Navigate, useParams } from 'react-router-dom'
import GameInfoPage from './GameInfoPage'
import { getGameById } from '../games/registry'

export default function GameInfoRoute() {
  const { gameId } = useParams<{ gameId: string }>()
  const game = gameId ? getGameById(gameId) : undefined

  if (!game) {
    return <Navigate to="/" replace />
  }

  return <GameInfoPage game={game} />
}
