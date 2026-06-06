import type { GameDef } from '../types'

export const anagram: GameDef = {
  id: 'anagram',
  name: 'Anagram & Word Find',
  description: 'Unscramble letters or hunt hidden words in a letter grid.',
  howToPlay:
    'Choose Anagram or Word Find. In Anagram, rearrange the scrambled letters to form a valid word. In Word Find, tap letters in the grid to spell words — longer words score more. Use hints if you get stuck.',
  icon: '🔤',
  category: 'word',
  modes: ['single'],
  status: 'live',
  load: () => import('./Anagram'),
}
