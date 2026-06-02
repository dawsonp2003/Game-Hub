import type { GameDef } from './types'
import { ticTacToe } from './tic-tac-toe/meta'
import { snake } from './snake/meta'
import { wordGuess } from './word-guess/meta'
import { hangman } from './hangman/meta'
import { wordLadder } from './word-ladder/meta'
import { wordChain } from './word-chain/meta'
import { anagram } from './anagram/meta'

export const GAMES: GameDef[] = [
  wordGuess,
  hangman,
  wordLadder,
  wordChain,
  anagram,
  ticTacToe,
  snake,
]

export function getGameById(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id)
}

export function getLiveGames(): GameDef[] {
  return GAMES.filter((g) => g.status === 'live')
}

/** Games with pass-and-play and/or remote modes. */
export function isMultiplayerGame(game: GameDef): boolean {
  return game.modes.includes('remote') || game.modes.includes('pass-and-play')
}
