export type ComputerOptionValue = string | number | boolean

export interface ComputerOptionChoice {
  value: ComputerOptionValue
  label: string
  description?: string
}

export interface ComputerOptionField {
  id: string
  label: string
  description?: string
  choices: ComputerOptionChoice[]
  default: ComputerOptionValue
}

export interface ComputerOptionsConfig {
  title?: string
  subtitle?: string
  fields: ComputerOptionField[]
}

/** Selected values keyed by field id (e.g. `{ difficulty: 'normal' }`). */
export type ComputerOptions = Record<string, ComputerOptionValue>
