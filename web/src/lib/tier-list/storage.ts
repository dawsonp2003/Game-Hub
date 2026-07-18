import type { TierListState } from '../../games/tier-list/types'

const STORAGE_PREFIX = 'game-arcade-tier-list:'

export interface SavedTierListMeta {
  id: string
  title: string
  savedAt: number
  itemCount: number
}

interface SavedTierListStore {
  lists: TierListState[]
}

function storageKey(playerId: string): string {
  return `${STORAGE_PREFIX}${playerId}`
}

function readStore(playerId: string): SavedTierListStore {
  try {
    const raw = localStorage.getItem(storageKey(playerId))
    if (!raw) return { lists: [] }
    const parsed = JSON.parse(raw) as SavedTierListStore
    if (!Array.isArray(parsed.lists)) return { lists: [] }
    return parsed
  } catch {
    return { lists: [] }
  }
}

function writeStore(playerId: string, store: SavedTierListStore): void {
  try {
    localStorage.setItem(storageKey(playerId), JSON.stringify(store))
  } catch {
    /* quota exceeded */
  }
}

export function listSavedTierLists(playerId: string): SavedTierListMeta[] {
  const store = readStore(playerId)
  return store.lists
    .map((list) => ({
      id: list.id,
      title: list.title,
      savedAt: list.updatedAt,
      itemCount: Object.keys(list.items).length,
    }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

export function loadSavedTierList(playerId: string, id: string): TierListState | null {
  const store = readStore(playerId)
  return store.lists.find((l) => l.id === id) ?? null
}

export function saveTierList(playerId: string, state: TierListState): void {
  const store = readStore(playerId)
  const updated = { ...state, updatedAt: Date.now() }
  const idx = store.lists.findIndex((l) => l.id === updated.id)
  if (idx >= 0) {
    store.lists[idx] = updated
  } else {
    store.lists.unshift(updated)
  }
  if (store.lists.length > 20) {
    store.lists = store.lists.slice(0, 20)
  }
  writeStore(playerId, store)
}

export function deleteSavedTierList(playerId: string, id: string): void {
  const store = readStore(playerId)
  store.lists = store.lists.filter((l) => l.id !== id)
  writeStore(playerId, store)
}
