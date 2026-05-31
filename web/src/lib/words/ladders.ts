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
]

/** Words allowed as intermediate ladder steps. */
const LADDER_WORD_LIST = [
  'CAT', 'COT', 'DOT', 'DOG', 'COG', 'LOG', 'COLD', 'CORD', 'CARD', 'WARD', 'WARM', 'WORM', 'WORD',
  'HEAD', 'HEAL', 'TEAL', 'TAIL', 'LOVE', 'LOSE', 'LOST', 'LIST', 'LINT', 'HINT', 'HATE', 'HAVE',
  'SHIP', 'SHOP', 'CHOP', 'COOP', 'COOK', 'COCK', 'DOCK', 'DUCK', 'DECK', 'FOOD', 'FOOL', 'FOUL',
  'FOUR', 'FORT', 'WORT', 'WORE', 'WIRE', 'WINE', 'FISH', 'FIST', 'FAST', 'BIRD', 'BARD', 'WOLF',
  'GOLF', 'GOLD', 'BOLD', 'BOLT', 'BOAT', 'BEAT', 'BEAR', 'FIRE', 'FINE', 'MINE', 'MICE', 'COAL',
  'MOON', 'NOON', 'SOON', 'SOAR', 'STAR', 'HAND', 'BAND', 'BOND', 'BOOT', 'FOOT', 'KING', 'PING',
  'PONG', 'POND', 'PAWN', 'COOL', 'WOOD', 'WOOL', 'DARK', 'DART', 'PART', 'PARK', 'PERK', 'PEAK',
  'GLOW', 'SLOW', 'SLOT', 'SOOT', 'FAST', 'TALL', 'SHORT', 'RICH', 'POOR', 'LIVE', 'DEAD', 'OPEN',
  'SHUT', 'EAST', 'WEST', 'GAME', 'GALE', 'GATE', 'PATE', 'PAST', 'CAST', 'CASE', 'BASE', 'LAME',
  'LATE', 'MATE', 'PLAN', 'PLAY', 'SLAM', 'SLAN', 'HALL', 'HAIL', 'FAIL', 'TALL', 'TILL', 'HART',
  'BART', 'BAST', 'MACE', 'MALE', 'COAT', 'WOOL', 'PEAK', 'PERK', 'BANE', 'BONE', 'LONE', 'LOBE',
  'LORE', 'WILD', 'WILL', 'WALL', 'HOT', 'HAT', 'HIT', 'BIT', 'BAT', 'BAG', 'BIG', 'DIG', 'FOG',
  'FIG', 'FIN', 'WIN', 'WIG', 'WAG', 'WAR', 'HOT', 'NOT', 'NUT', 'NET', 'WET', 'WIT', 'SIT', 'SIN',
  'PIN', 'PAN', 'PAT', 'POT', 'PIT', 'PET', 'PEA', 'SEA', 'TEA', 'TEN', 'MEN', 'PEN', 'HEN', 'HER',
  'PER', 'PAR', 'BAR', 'CAR', 'FAR', 'MAR', 'TAR', 'WAR', 'WAS', 'HAS', 'HAD', 'BAD', 'BID', 'BUD',
  'BUN', 'BUT', 'CUT', 'CUP', 'CAP', 'MAP', 'GAP', 'GAS', 'GAG', 'GIG', 'RIG', 'RID', 'RED', 'BED',
  'BEG', 'LEG', 'LED', 'LID', 'LAD', 'CAD', 'COD', 'CUD', 'CUB', 'TUB', 'TAB', 'TAD', 'TOD', 'TOW',
  'TWO', 'WHO', 'WHY', 'TRY', 'PRY', 'FRY', 'DRY', 'SKY', 'SPY', 'SHY', 'CRY', 'CAY', 'DAY', 'MAY',
  'RAY', 'SAY', 'WAY', 'LAY', 'HAY', 'JAY', 'NAY', 'PAY', 'YAY', 'YAP', 'YAM', 'YAK', 'YAW', 'YEA',
]

export const LADDER_WORD_SET = new Set<string>(
  [...new Set([...LADDER_WORD_LIST, ...LADDER_PUZZLES.flatMap((p) => [p.start, p.end])])].map((w) =>
    w.toUpperCase(),
  ),
)
