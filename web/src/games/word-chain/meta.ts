import type { GameDef } from '../types'

export const wordChain: GameDef = {
  id: 'word-chain',
  name: 'Word Chain',
  description:
    'Build compound word chains for your opponent. They get the first word and letter hints — fewest mistakes wins.',
  howToPlay:
    'One player secretly builds a chain of compound words (each word starts with the last word of the previous pair). The other player sees the first word and how many letters each hidden word has, then guesses one letter at a time. Fewest wrong guesses wins the round.',
  icon: '🔗',
  category: 'word',
  modes: ['pass-and-play', 'async'],
  checkpointModes: ['pass-and-play', 'async'],
  status: 'live',
  load: () => import('./WordChain'),
}
