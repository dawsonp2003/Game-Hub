export type TierItemSource = 'manual' | 'wiki' | 'preset' | 'prompt'

export interface TierItem {
  id: string
  label: string
  imageUrl?: string
  description?: string
  source: TierItemSource
}

export interface Tier {
  id: string
  label: string
  color: string
  itemIds: string[]
}

export interface TierListState {
  id: string
  title: string
  tiers: Tier[]
  unranked: string[]
  items: Record<string, TierItem>
  updatedAt: number
}

export type ContainerId = 'unranked' | `tier-${string}`

export function tierContainerId(tierId: string): ContainerId {
  return `tier-${tierId}`
}

export function parseContainerId(id: string): { type: 'unranked' } | { type: 'tier'; tierId: string } | null {
  if (id === 'unranked') return { type: 'unranked' }
  if (id.startsWith('tier-')) return { type: 'tier', tierId: id.slice(5) }
  return null
}

export function findItemContainer(state: TierListState, itemId: string): ContainerId | null {
  if (state.unranked.includes(itemId)) return 'unranked'
  for (const tier of state.tiers) {
    if (tier.itemIds.includes(itemId)) return tierContainerId(tier.id)
  }
  return null
}

export function getContainerItemIds(state: TierListState, containerId: ContainerId): string[] {
  if (containerId === 'unranked') return state.unranked
  const tierId = containerId.slice(5)
  const tier = state.tiers.find((t) => t.id === tierId)
  return tier?.itemIds ?? []
}
