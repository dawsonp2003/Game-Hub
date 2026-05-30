import type { GameDef } from './types'
import { ticTacToe } from './tic-tac-toe/meta'
import { snake } from './snake/meta'

export const GAMES: GameDef[] = [ticTacToe, snake]

export function getGameById(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id)
}

export function getLiveGames(): GameDef[] {
  return GAMES.filter((g) => g.status === 'live')
}
