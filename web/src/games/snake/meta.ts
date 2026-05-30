import type { GameDef } from '../types'

export const snake: GameDef = {
  id: 'snake',
  name: 'Snake',
  description: 'Eat food, grow longer, don’t hit the walls or yourself.',
  icon: '🐍',
  category: 'arcade',
  modes: ['single'],
  status: 'live',
  load: () => import('./Snake'),
}
