import type { GameDef } from '../types'
import { ultimateTicTacToeComputerOptions } from './computer-options'

export const ultimateTicTacToe: GameDef = {
  id: 'ultimate-tic-tac-toe',
  name: 'Ultimate Tic Tac Toe',
  description:
    'Nine boards in one — your move sends your opponent to the matching mini board. Win three boards in a row to take the game.',
  howToPlay:
    'Play on a 3×3 grid of mini tic-tac-toe boards. Where you place your mark sends your opponent to that mini board on their turn. Win a mini board to claim it; win three claimed boards in a row on the main grid to win the game. If sent to a board that is already won or full, you may play anywhere.',
  icon: '⊞',
  image: '/games/ultimate-tic-tac-toe.png',
  category: 'board-2p',
  modes: ['ai', 'pass-and-play', 'async'],
  checkpointModes: ['ai', 'pass-and-play', 'async'],
  computerOptions: ultimateTicTacToeComputerOptions,
  status: 'live',
  load: () => import('./UltimateTicTacToe'),
}
