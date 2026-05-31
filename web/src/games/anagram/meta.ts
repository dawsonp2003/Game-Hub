import type { GameDef } from '../types'

export const anagram: GameDef = {
  id: 'anagram',
  name: 'Anagram & Word Find',
  description: 'Unscramble letters or hunt hidden words in a letter grid.',
  icon: '🔤',
  category: 'word',
  modes: ['single'],
  status: 'live',
  load: () => import('./Anagram'),
}
