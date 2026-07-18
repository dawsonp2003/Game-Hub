import type { Tier, TierItem, TierListState } from './types'

export const DEFAULT_TIER_DEFS: Pick<Tier, 'id' | 'label' | 'color'>[] = [
  { id: 's', label: 'S', color: '#ff7f7f' },
  { id: 'a', label: 'A', color: '#ffbf7f' },
  { id: 'b', label: 'B', color: '#ffdf7f' },
  { id: 'c', label: 'C', color: '#ffff7f' },
  { id: 'd', label: 'D', color: '#bfff7f' },
  { id: 'e', label: 'E', color: '#7fff7f' },
  { id: 'f', label: 'F', color: '#7fbfff' },
]

export function createDefaultTiers(): Tier[] {
  return DEFAULT_TIER_DEFS.map((t) => ({ ...t, itemIds: [] }))
}

export function createEmptyState(title = 'My Tier List'): TierListState {
  return {
    id: crypto.randomUUID(),
    title,
    tiers: createDefaultTiers(),
    unranked: [],
    items: {},
    updatedAt: Date.now(),
  }
}

export function buildItemsFromEntries(
  entries: { label: string; imageUrl?: string; description?: string }[],
  source: TierItem['source'],
): Pick<TierListState, 'items' | 'unranked'> {
  const items: Record<string, TierItem> = {}
  const unranked: string[] = []
  for (const entry of entries) {
    const id = crypto.randomUUID()
    items[id] = {
      id,
      label: entry.label,
      imageUrl: entry.imageUrl,
      description: entry.description,
      source,
    }
    unranked.push(id)
  }
  return { items, unranked }
}
