import type { GameDef } from '../types'

export const wordChain: GameDef = {
  id: 'word-chain',
  name: 'Word Chain',
  description:
    'Build compound word chains for your opponent. They get the first word and letter hints — fewest mistakes wins.',
  icon: '🔗',
  category: 'word',
  modes: ['pass-and-play', 'remote'],
  status: 'live',
  load: () => import('./WordChain'),
}
