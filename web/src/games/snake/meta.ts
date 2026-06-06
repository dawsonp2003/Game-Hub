import type { GameDef } from '../types'

export const snake: GameDef = {
  id: 'snake',
  name: 'Snake',
  description: 'Eat food, grow longer, don’t hit the walls or yourself.',
  howToPlay:
    'Use the arrow keys or swipe to steer the snake. Eat food to grow and increase your score. Avoid hitting the walls or your own tail — one collision ends the run.',
  icon: '🐍',
  category: 'arcade',
  modes: ['single'],
  status: 'live',
  load: () => import('./Snake'),
}
