import { getGameById } from '../../games/registry'
import type { ComputerOptions, ComputerOptionField } from './types'
import { resolveComputerOptions } from './defaults'
import { loadSavedComputerOptions } from './storage'

const DIFFICULTY_FIELD_IDS = new Set(['difficulty', 'level', 'aiLevel'])

function isDifficultyField(field: ComputerOptionField): boolean {
  if (DIFFICULTY_FIELD_IDS.has(field.id)) return true
  return field.label.toLowerCase().includes('difficulty')
}

/** Resolve options to store for an AI session (explicit choice, saved prefs, or game defaults). */
export function resolveRecordedComputerOptions(
  gameId: string,
  mode: string,
  passed?: ComputerOptions,
): ComputerOptions | undefined {
  if (mode !== 'ai') return undefined

  const config = getGameById(gameId)?.computerOptions
  if (!config) {
    return passed && Object.keys(passed).length > 0 ? passed : undefined
  }

  const resolved = resolveComputerOptions(
    config,
    passed ?? loadSavedComputerOptions(gameId) ?? undefined,
  )
  return Object.keys(resolved).length > 0 ? resolved : undefined
}

/** Human-readable difficulty for history tables, e.g. "Expert". */
export function computerDifficultyLabel(gameId: string, options?: ComputerOptions): string | null {
  if (!options) return null

  const config = getGameById(gameId)?.computerOptions
  if (config) {
    const field = config.fields.find(isDifficultyField) ?? config.fields[0]
    if (field) {
      const value = options[field.id]
      if (value !== undefined && value !== null) {
        const choice = field.choices.find((c) => c.value === value)
        if (choice) return choice.label
        const raw = String(value)
        return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null
      }
    }
  }

  for (const key of DIFFICULTY_FIELD_IDS) {
    const value = options[key]
    if (value === undefined || value === null) continue
    const raw = String(value)
    if (!raw) return null
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }

  return null
}

export function gameHasComputerDifficulty(gameId: string): boolean {
  return !!getGameById(gameId)?.computerOptions
}
