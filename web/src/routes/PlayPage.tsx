import { Navigate, useParams } from 'react-router-dom'
import GameShell from '../components/GameShell'
import { getGameById } from '../games/registry'

export default function PlayPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const game = gameId ? getGameById(gameId) : undefined

  if (!game) {
    return <Navigate to="/" replace />
  }

  return <GameShell game={game} />
}
