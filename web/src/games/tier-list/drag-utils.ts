import type { ContainerId, TierListState } from './types'
import { findItemContainer, getContainerItemIds, parseContainerId, tierContainerId } from './types'

export function resolveOverContainer(state: TierListState, overId: string): ContainerId | null {
  const parsed = parseContainerId(overId)
  if (parsed) {
    return parsed.type === 'unranked' ? 'unranked' : tierContainerId(parsed.tierId)
  }
  return findItemContainer(state, overId)
}

export function moveItemBetweenContainers(
  state: TierListState,
  activeId: string,
  from: ContainerId,
  to: ContainerId,
  overId: string,
): TierListState {
  if (from === to) {
    const ids = [...getContainerItemIds(state, from)]
    const oldIndex = ids.indexOf(activeId)
    if (oldIndex < 0) return state

    let newIndex: number
    if (overId === from || parseContainerId(overId)) {
      newIndex = ids.length - 1
    } else {
      newIndex = ids.indexOf(overId)
      if (newIndex < 0) newIndex = ids.length - 1
    }

    if (oldIndex === newIndex) return state
    ids.splice(oldIndex, 1)
    ids.splice(newIndex, 0, activeId)
    return setContainerIds(state, from, ids)
  }

  const fromIds = [...getContainerItemIds(state, from)]
  const toIds = [...getContainerItemIds(state, to)]
  const fromIndex = fromIds.indexOf(activeId)
  if (fromIndex < 0) return state

  fromIds.splice(fromIndex, 1)

  let insertIndex = toIds.length
  if (overId !== to && !parseContainerId(overId)) {
    const overIndex = toIds.indexOf(overId)
    if (overIndex >= 0) insertIndex = overIndex
  }

  toIds.splice(insertIndex, 0, activeId)

  let next = setContainerIds(state, from, fromIds)
  next = setContainerIds(next, to, toIds)
  return next
}

function setContainerIds(state: TierListState, containerId: ContainerId, ids: string[]): TierListState {
  if (containerId === 'unranked') {
    return { ...state, unranked: ids, updatedAt: Date.now() }
  }
  const tierId = containerId.slice(5)
  return {
    ...state,
    tiers: state.tiers.map((t) => (t.id === tierId ? { ...t, itemIds: ids } : t)),
    updatedAt: Date.now(),
  }
}

export function clearTierRow(state: TierListState, tierId: string): TierListState {
  const tier = state.tiers.find((t) => t.id === tierId)
  if (!tier || tier.itemIds.length === 0) return state
  return {
    ...state,
    unranked: [...state.unranked, ...tier.itemIds],
    tiers: state.tiers.map((t) => (t.id === tierId ? { ...t, itemIds: [] } : t)),
    updatedAt: Date.now(),
  }
}

export function resetAllToUnranked(state: TierListState): TierListState {
  const allIds = [
    ...state.unranked,
    ...state.tiers.flatMap((t) => t.itemIds),
  ]
  return {
    ...state,
    unranked: allIds,
    tiers: state.tiers.map((t) => ({ ...t, itemIds: [] })),
    updatedAt: Date.now(),
  }
}
