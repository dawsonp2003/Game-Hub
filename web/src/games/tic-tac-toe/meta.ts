import type { GameDef } from '../types'

export const ticTacToe: GameDef = {
  id: 'tic-tac-toe',
  name: 'Tic Tac Toe',
  description: 'Classic 3×3 grid. Play solo, vs AI, pass-and-play, or remotely.',
  icon: '⭕',
  category: 'board-2p',
  modes: ['ai', 'pass-and-play', 'remote'],
  status: 'live',
  load: () => import('./TicTacToe'),
}
