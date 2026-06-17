import type { ComputerOptions } from '../computer-options'
import { computerDifficultyLabel } from '../computer-options'
import type { GameEndInput, GameResult } from './types'

export interface PlayHistoryEntry {
  mode: string
  result?: GameResult
  score?: number
  turns?: number
  playedAt: string
  /** Computer mode settings when mode is `ai`. */
  computerOptions?: ComputerOptions
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
    computerOptions: input.computerOptions,
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
export function modeDisplayLabel(
  mode: string,
  computerOptions?: ComputerOptions,
  gameId?: string,
): string {
  const base = (() => {
    switch (normalizeModeKey(mode)) {
      case 'single':
      case 'solo':
        return 'Solo'
      case 'ai':
        return 'Computer'
      case 'pass-and-play':
        return 'Pass & Play'
      case 'remote':
      case 'async':
        return 'Online'
      default:
        return mode
    }
  })()

  if (normalizeModeKey(mode) !== 'ai') return base

  const difficulty = gameId
    ? computerDifficultyLabel(gameId, computerOptions)
    : difficultyLabelFromOptionsFallback(computerOptions)
  return difficulty ? `${difficulty} ${base}` : base
}

function difficultyLabelFromOptionsFallback(options?: ComputerOptions): string | null {
  if (!options) return null
  for (const key of ['difficulty', 'level', 'aiLevel'] as const) {
    const value = options[key]
    if (value === undefined || value === null) continue
    const raw = String(value)
    if (!raw) return null
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }
  return null
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

export interface HistoryTableRow {
  date: string
  mode: string
  result: string
}

function formatHistoryDate(playedAt: string): string {
  return new Date(playedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function formatHistoryResult(entry: PlayHistoryEntry, gameId?: string): string {
  let turnSuffix = ''
  if (typeof entry.turns === 'number' && entry.turns > 0) {
    if (gameId === 'word-ladder') turnSuffix = ` · ${entry.turns} steps`
    else if (gameId === 'hangman') turnSuffix = ` · ${entry.turns} letters`
    else if (gameId === 'word-guess') turnSuffix = ` · ${entry.turns} guesses`
  }

  if (entry.result) {
    const outcome = entry.result === 'win' ? 'Win' : entry.result === 'loss' ? 'Loss' : 'Draw'
    return `${outcome}${turnSuffix}`
  }
  if (typeof entry.score === 'number') {
    return `Score ${entry.score}`
  }
  return '—'
}

export function formatHistoryRow(entry: PlayHistoryEntry, gameId?: string): HistoryTableRow {
  return {
    date: formatHistoryDate(entry.playedAt),
    mode: modeDisplayLabel(entry.mode, entry.computerOptions, gameId),
    result: formatHistoryResult(entry, gameId),
  }
}

export function formatHistoryLine(entry: PlayHistoryEntry, gameId?: string): string {
  const { date, mode, result } = formatHistoryRow(entry, gameId)
  return `${date} · ${mode} · ${result}`
}
