import type { GameDef } from '../types'

export const hangman: GameDef = {
  id: 'hangman',
  name: 'Hangman',
  description: 'Guess the hidden word letter by letter before the figure is complete.',
  icon: '🪢',
  category: 'word',
  modes: ['single', 'pass-and-play', 'remote'],
  status: 'live',
  load: () => import('./Hangman'),
}
