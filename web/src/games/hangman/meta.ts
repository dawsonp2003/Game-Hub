import type { GameDef } from '../types'

export const hangman: GameDef = {
  id: 'hangman',
  name: 'Hangman',
  description: 'Guess the hidden word letter by letter before the figure is complete.',
  howToPlay:
    'Pick a letter. Correct guesses reveal every matching spot in the word. Wrong guesses add a piece to the hangman — you lose after too many mistakes. In pass-and-play or online, take turns guessing until someone solves the word or runs out of chances.',
  icon: '🪢',
  category: 'word',
  modes: ['single', 'pass-and-play', 'remote'],
  status: 'live',
  load: () => import('./Hangman'),
}
