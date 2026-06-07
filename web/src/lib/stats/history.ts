import type { GameEndInput, GameResult } from './types'

export interface PlayHistoryEntry {
  mode: string
  result?: GameResult
  score?: number
  turns?: number
  playedAt: string
}

const HISTORY_KEY = 'game-arcade-play-history'
const MAX_RECENT = 20

function loadAll(): Record<string, PlayHistoryEntry[]> {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, PlayHistoryEntry[]>
  } catch {
    return {}
  }
}

function saveAll(data: Record<string, PlayHistoryEntry[]>): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(data))
}

export function appendLocalPlayHistory(input: GameEndInput): void {
  const data = loadAll()
  const entry: PlayHistoryEntry = {
    mode: input.mode,
    result: input.result,
    score: input.score,
    turns: input.turns,
    playedAt: new Date().toISOString(),
  }
  const list = [entry, ...(data[input.gameId] ?? [])].slice(0, MAX_RECENT)
  data[input.gameId] = list
  saveAll(data)
}

export function getLocalPlayHistory(gameId: string): PlayHistoryEntry[] {
  return loadAll()[gameId] ?? []
}

export function favoriteModeFromHistory(
  entries: PlayHistoryEntry[],
  allowedModes?: string[],
): string | null {
  if (entries.length === 0) return null

  const counts = new Map<string, number>()
  for (const e of entries) {
    const key = normalizeModeKey(e.mode)
    if (allowedModes && !allowedModes.some((m) => normalizeModeKey(m) === key)) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  let best: string | null = null
  let bestCount = 0
  for (const [mode, count] of counts) {
    if (count > bestCount) {
      best = mode
      bestCount = count
    }
  }
  return best
}

/** Map stored mode strings to display labels. */
export function modeDisplayLabel(mode: string): string {
  switch (normalizeModeKey(mode)) {
    case 'single':
    case 'solo':
      return 'Solo'
    case 'ai':
      return 'Computer'
    case 'pass-and-play':
      return 'Pass & Play'
    case 'remote':
      return 'Online'
    default:
      return mode
  }
}

function normalizeModeKey(mode: string): string {
  if (mode === 'solo') return 'single'
  return mode
}

export function gameModeFromFavorite(
  favorite: string | null,
  allowedModes: readonly string[],
): string | null {
  if (!favorite) return null
  const key = normalizeModeKey(favorite)
  return allowedModes.find((m) => normalizeModeKey(m) === key) ?? null
}

export function sessionsForMode(entries: PlayHistoryEntry[], mode: string): PlayHistoryEntry[] {
  const key = normalizeModeKey(mode)
  return entries.filter((e) => normalizeModeKey(e.mode) === key)
}

export interface SessionStats {
  plays: number
  wins: number
  losses: number
  draws: number
}

export function computeSessionStats(entries: PlayHistoryEntry[]): SessionStats {
  return {
    plays: entries.length,
    wins: entries.filter((e) => e.result === 'win').length,
    losses: entries.filter((e) => e.result === 'loss').length,
    draws: entries.filter((e) => e.result === 'draw').length,
  }
}

export function formatHistoryLine(entry: PlayHistoryEntry, gameId?: string): string {
  const date = new Date(entry.playedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const mode = modeDisplayLabel(entry.mode)
  let turnSuffix = ''
  if (typeof entry.turns === 'number' && entry.turns > 0) {
    if (gameId === 'word-ladder') turnSuffix = ` · ${entry.turns} steps`
    else if (gameId === 'hangman') turnSuffix = ` · ${entry.turns} letters`
    else if (gameId === 'word-guess') turnSuffix = ` · ${entry.turns} guesses`
  }

  if (entry.result) {
    const outcome = entry.result === 'win' ? 'Win' : entry.result === 'loss' ? 'Loss' : 'Draw'
    return `${date} · ${mode} · ${outcome}${turnSuffix}`
  }
  if (typeof entry.score === 'number') {
    return `${date} · ${mode} · Score ${entry.score}`
  }
  return `${date} · ${mode}`
}
