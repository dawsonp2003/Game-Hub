import { computeSessionStats, type PlayHistoryEntry } from './history'

export type StatMetric =
  | 'plays'
  | 'wins'
  | 'losses'
  | 'draws'
  | 'bestScore'
  | 'avgWinTurns'

export interface StatDisplayItem {
  label: string
  value: string
}

const METRIC_LABELS: Record<StatMetric, string> = {
  plays: 'Games played',
  wins: 'Wins',
  losses: 'Losses',
  draws: 'Draws',
  bestScore: 'Best score',
  avgWinTurns: 'Avg. guesses',
}

/** Which aggregate stats to show per game (filtered by mode on the info page). */
export const GAME_STAT_METRICS: Record<string, StatMetric[]> = {
  snake: ['plays', 'bestScore'],
  anagram: ['plays', 'bestScore'],
  'word-guess': ['plays', 'wins', 'avgWinTurns'],
  hangman: ['plays', 'wins', 'avgWinTurns'],
  'word-ladder': ['plays', 'wins', 'avgWinTurns'],
  'word-chain': ['plays', 'wins', 'losses'],
  'tic-tac-toe': ['plays', 'wins', 'losses', 'draws'],
  'ultimate-tic-tac-toe': ['plays', 'wins', 'losses', 'draws'],
}

const DEFAULT_METRICS: StatMetric[] = ['plays', 'wins', 'losses', 'draws']

function bestScoreFromSessions(entries: PlayHistoryEntry[]): number | null {
  const scores = entries
    .map((e) => e.score)
    .filter((s): s is number => typeof s === 'number')
  return scores.length > 0 ? Math.max(...scores) : null
}

function avgWinTurns(entries: PlayHistoryEntry[]): number | null {
  const turns = entries
    .filter((e) => e.result === 'win')
    .map((e) => e.turns)
    .filter((t): t is number => typeof t === 'number' && t > 0)
  if (turns.length === 0) return null
  const avg = turns.reduce((a, b) => a + b, 0) / turns.length
  return Math.round(avg * 10) / 10
}

function formatMetricValue(metric: StatMetric, entries: PlayHistoryEntry[]): string {
  const base = computeSessionStats(entries)

  switch (metric) {
    case 'plays':
      return String(base.plays)
    case 'wins':
      return String(base.wins)
    case 'losses':
      return String(base.losses)
    case 'draws':
      return String(base.draws)
    case 'bestScore': {
      const best = bestScoreFromSessions(entries)
      return best !== null ? String(best) : '—'
    }
    case 'avgWinTurns': {
      const avg = avgWinTurns(entries)
      return avg !== null ? String(avg) : '—'
    }
    default:
      return '—'
  }
}

/** Labels that differ by game (e.g. word ladder steps vs wordle guesses). */
function metricLabel(gameId: string, metric: StatMetric): string {
  if (metric === 'avgWinTurns') {
    if (gameId === 'word-ladder') return 'Avg. steps'
    if (gameId === 'hangman') return 'Avg. letters'
  }
  if (metric === 'bestScore' && gameId === 'anagram') return 'Most words'
  return METRIC_LABELS[metric]
}

export function computeGameStatDisplay(
  gameId: string,
  entries: PlayHistoryEntry[],
): StatDisplayItem[] {
  if (entries.length === 0) return []

  const metrics = GAME_STAT_METRICS[gameId] ?? DEFAULT_METRICS

  return metrics.map((metric) => ({
    label: metricLabel(gameId, metric),
    value: formatMetricValue(metric, entries),
  }))
}
