import { LADDER_DICTIONARY_SET } from './ladder-dictionary'

export interface LadderPuzzle {
  start: string
  end: string
  minSteps?: number
}

/** Curated word-ladder puzzles with known valid paths. */
export const LADDER_PUZZLES: LadderPuzzle[] = [
  { start: 'COLD', end: 'WARM', minSteps: 4 },
  { start: 'CAT', end: 'DOG', minSteps: 3 },
  { start: 'HEAD', end: 'TAIL', minSteps: 3 },
  { start: 'LOVE', end: 'HATE', minSteps: 4 },
  { start: 'SHIP', end: 'DOCK', minSteps: 6 },
  { start: 'FOOD', end: 'WINE', minSteps: 4 },
  { start: 'FISH', end: 'BIRD', minSteps: 4 },
  { start: 'WOLF', end: 'BEAR', minSteps: 4 },
  { start: 'FIRE', end: 'COAL', minSteps: 3 },
  { start: 'MOON', end: 'STAR', minSteps: 4 },
  { start: 'HAND', end: 'FOOT', minSteps: 4 },
  { start: 'WARM', end: 'COOL', minSteps: 4 },
  { start: 'DARK', end: 'GLOW', minSteps: 4 },
  { start: 'SLOW', end: 'FAST', minSteps: 4 },
  { start: 'OPEN', end: 'SHUT', minSteps: 4 },
  { start: 'EAST', end: 'WEST', minSteps: 4 },
  { start: 'KING', end: 'PAWN', minSteps: 4 },
  { start: 'RICH', end: 'POOR', minSteps: 4 },
  { start: 'LIVE', end: 'DEAD', minSteps: 4 },
  { start: 'GAME', end: 'PLAY', minSteps: 4 },
  { start: 'WORD', end: 'WORK', minSteps: 4 },
  { start: 'BEST', end: 'WORST', minSteps: 5 },
  { start: 'CARE', end: 'CURE', minSteps: 3 },
  { start: 'BONE', end: 'STONE', minSteps: 4 },
  { start: 'RAIN', end: 'SNOW', minSteps: 4 },
  { start: 'BLUE', end: 'PINK', minSteps: 5 },
  { start: 'TREE', end: 'LEAF', minSteps: 4 },
  { start: 'GOLD', end: 'SILVER', minSteps: 6 },
  { start: 'MIND', end: 'BODY', minSteps: 4 },
  { start: 'TALE', end: 'MYTH', minSteps: 4 },
  { start: 'COAL', end: 'GEMS', minSteps: 4 },
  { start: 'WAVE', end: 'TIDE', minSteps: 3 },
  { start: 'LION', end: 'CUBS', minSteps: 4 },
  { start: 'CODE', end: 'DATA', minSteps: 4 },
]

/** All words allowed as ladder steps (offline dictionary + puzzle endpoints). */
export const LADDER_WORD_SET = new Set<string>([
  ...LADDER_DICTIONARY_SET,
  ...LADDER_PUZZLES.flatMap((p) => [p.start, p.end]),
].map((w) => w.toUpperCase()))
