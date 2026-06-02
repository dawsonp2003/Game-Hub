import type { GameDef } from '../types'

export const ultimateTicTacToe: GameDef = {
  id: 'ultimate-tic-tac-toe',
  name: 'Ultimate Tic Tac Toe',
  description:
    'Nine boards in one — your move sends your opponent to the matching mini board. Win three boards in a row to take the game.',
  icon: '⊞',
  category: 'board-2p',
  modes: ['ai', 'pass-and-play', 'remote'],
  status: 'live',
  load: () => import('./UltimateTicTacToe'),
}
