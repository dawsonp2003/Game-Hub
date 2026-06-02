import type { GameDef } from '../types'

export const wordLadder: GameDef = {
  id: 'word-ladder',
  name: 'Word Ladder',
  description: 'Change one letter at a time from start to end. Race a friend to finish in fewer steps, or play solo.',
  icon: '🪜',
  category: 'word',
  modes: ['single', 'pass-and-play', 'remote'],
  status: 'live',
  load: () => import('./WordLadder'),
}
