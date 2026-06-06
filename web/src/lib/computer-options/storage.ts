import type { ComputerOptions } from './types'

const STORAGE_KEY = 'game-arcade-computer-options'

function loadAll(): Record<string, ComputerOptions> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, ComputerOptions>
  } catch {
    return {}
  }
}

function saveAll(data: Record<string, ComputerOptions>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadSavedComputerOptions(gameId: string): ComputerOptions | null {
  const saved = loadAll()[gameId]
  return saved ?? null
}

export function saveComputerOptions(gameId: string, options: ComputerOptions): void {
  const data = loadAll()
  data[gameId] = options
  saveAll(data)
}
