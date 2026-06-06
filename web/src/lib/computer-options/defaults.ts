import type { ComputerOptions, ComputerOptionsConfig } from './types'

export function defaultComputerOptions(config: ComputerOptionsConfig): ComputerOptions {
  return Object.fromEntries(config.fields.map((f) => [f.id, f.default]))
}

export function resolveComputerOptions(
  config: ComputerOptionsConfig | undefined,
  selected: ComputerOptions | undefined,
): ComputerOptions {
  if (!config) return selected ?? {}
  const base = defaultComputerOptions(config)
  return { ...base, ...selected }
}

export function getComputerOptionString(
  options: ComputerOptions | undefined,
  fieldId: string,
  fallback: string,
): string {
  const value = options?.[fieldId]
  if (value === undefined || value === null) return fallback
  return String(value)
}
