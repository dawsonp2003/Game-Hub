import type { GameDef } from '../types'

export const tierList: GameDef = {
  id: 'tier-list',
  name: 'Tier List',
  description: 'Rank anything from S to F — generate cards from a prompt or build your own.',
  howToPlay:
    'Drag cards from the unranked pool into tier rows (S is best, F is worst). Within a row, leftmost means higher rank. Drag back to unranked to remove a ranking. Use a prompt like "Pokemon" to auto-generate cards, pick a preset, or add your own images.',
  icon: '📊',
  category: 'logic',
  modes: ['single'],
  status: 'live',
  load: () => import('./TierList'),
}
