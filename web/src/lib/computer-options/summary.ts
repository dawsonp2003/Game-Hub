import type { ComputerOptions, ComputerOptionsConfig, ComputerOptionField } from './types'
import { resolveComputerOptions } from './defaults'

const DIFFICULTY_FIELD_IDS = new Set(['difficulty', 'level', 'aiLevel'])

function isDifficultyField(field: ComputerOptionField): boolean {
  if (DIFFICULTY_FIELD_IDS.has(field.id)) return true
  return field.label.toLowerCase().includes('difficulty')
}

function choiceLabel(field: ComputerOptionField, value: ComputerOptions[string]): string {
  const match = field.choices.find((c) => c.value === value)
  return match?.label ?? String(value)
}

function findDifficultyField(fields: ComputerOptionField[]): ComputerOptionField | undefined {
  return fields.find(isDifficultyField)
}

/**
 * Short one-line label for the game info page, e.g. "Difficulty: Normal"
 * or "Difficulty: Hard custom" when extra non-default options are set.
 */
export function formatComputerOptionsSummary(
  config: ComputerOptionsConfig,
  options: ComputerOptions,
): string {
  const resolved = resolveComputerOptions(config, options)
  const { fields } = config

  if (fields.length === 0) return 'Difficulty: Custom'

  if (fields.length === 1) {
    return `Difficulty: ${choiceLabel(fields[0]!, resolved[fields[0]!.id])}`
  }

  const difficultyField = findDifficultyField(fields)
  const primaryField = difficultyField ?? fields[0]!
  const primaryLabel = choiceLabel(primaryField, resolved[primaryField.id])

  const otherFields = fields.filter((f) => f.id !== primaryField.id)
  const customExtras = otherFields.filter((f) => resolved[f.id] !== f.default)

  if (customExtras.length === 0) {
    return `Difficulty: ${primaryLabel}`
  }

  if (difficultyField) {
    return `Difficulty: ${primaryLabel} custom`
  }

  if (customExtras.length === 1 && otherFields.length === 1) {
    return `Difficulty: ${choiceLabel(customExtras[0]!, resolved[customExtras[0]!.id])}`
  }

  return 'Difficulty: Custom'
}
