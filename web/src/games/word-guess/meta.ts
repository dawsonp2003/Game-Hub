import type { GameDef } from '../types'

export const wordGuess: GameDef = {
  id: 'word-guess',
  name: 'Word Guess',
  description: 'Unlimited 5-letter word puzzle. Green, yellow, and gray hints like classic word games.',
  howToPlay:
    'Guess a five-letter word. Green means the letter is correct and in the right spot. Yellow means the letter is in the word but in a different spot. Gray means the letter is not in the word. You have six guesses to find the answer.',
  icon: '🟩',
  category: 'word',
  modes: ['single', 'pass-and-play', 'async'],
  checkpointModes: ['single', 'pass-and-play', 'async'],
  status: 'live',
  load: () => import('./WordGuess'),
}
