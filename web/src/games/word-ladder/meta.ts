import type { GameDef } from '../types'

export const wordLadder: GameDef = {
  id: 'word-ladder',
  name: 'Word Ladder',
  description: 'Change one letter at a time from start to end. Race a friend to finish in fewer steps, or play solo.',
  howToPlay:
    'Start from the first word and change exactly one letter per step until you reach the target word. Every step must be a valid English word. Solo mode lets you find your own path; versus modes compare who finishes in fewer moves.',
  icon: '🪜',
  category: 'word',
  modes: ['single', 'pass-and-play', 'async'],
  checkpointModes: ['single', 'pass-and-play', 'async'],
  status: 'live',
  load: () => import('./WordLadder'),
}
