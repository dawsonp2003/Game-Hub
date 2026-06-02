import type { GameDef } from '../types'

export const wordGuess: GameDef = {
  id: 'word-guess',
  name: 'Word Guess',
  description: 'Unlimited 5-letter word puzzle. Green, yellow, and gray hints like classic word games.',
  icon: '🟩',
  category: 'word',
  modes: ['single', 'pass-and-play', 'remote'],
  status: 'live',
  load: () => import('./WordGuess'),
}
