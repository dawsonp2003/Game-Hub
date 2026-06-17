import type { GameDef } from '../types'
import { ticTacToeComputerOptions } from './computer-options'

export const ticTacToe: GameDef = {
  id: 'tic-tac-toe',
  name: 'Tic Tac Toe',
  description: 'Classic 3×3 grid. Play solo, vs AI, pass-and-play, or online with a friend.',
  howToPlay:
    'Take turns placing X and O on a 3×3 grid. The first player to get three in a row — across, down, or diagonal — wins. If the board fills with no winner, the game is a draw.',
  icon: '⭕',
  image: '/games/tic-tac-toe.png',
  category: 'board-2p',
  modes: ['ai', 'pass-and-play', 'async'],
  checkpointModes: ['ai', 'pass-and-play', 'async'],
  computerOptions: ticTacToeComputerOptions,
  status: 'live',
  load: () => import('./TicTacToe'),
}
