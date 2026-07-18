import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useCallback, useRef, useState } from 'react'
import type { TierListState } from './types'
import { findItemContainer, getContainerItemIds, parseContainerId, type ContainerId } from './types'
import { moveItemBetweenContainers, resolveOverContainer } from './drag-utils'
import TierRow from './TierRow'
import UnrankedTray from './UnrankedTray'
import { ItemCardOverlay } from './ItemCard'

interface TierBoardProps {
  state: TierListState
  /** Live preview while dragging (no history entry). */
  onPreview: (state: TierListState) => void
  /** Commit after drag or row clear (creates undo point). */
  onCommit: (state: TierListState, before?: TierListState) => void
}

/** Prefer the container under the cursor (tier rows), not closest center to unranked cards. */
const tierCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  if (pointerHits.length > 0) return pointerHits
  return rectIntersection(args)
}

export default function TierBoard({ state, onPreview, onCommit }: TierBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const stateRef = useRef(state)
  const dragSnapshotRef = useRef<TierListState | null>(null)
  stateRef.current = state

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  const handleDragStart = useCallback(() => {
    dragSnapshotRef.current = structuredClone(stateRef.current)
  }, [])

  const handleDragStartWithId = useCallback(
    (event: DragStartEvent) => {
      setActiveId(String(event.active.id))
      handleDragStart()
    },
    [handleDragStart],
  )

  const finishDrag = useCallback(() => {
    setActiveId(null)
    const before = dragSnapshotRef.current
    dragSnapshotRef.current = null
    if (before) {
      onCommit(stateRef.current, before)
    }
  }, [onCommit])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) return

      const current = stateRef.current
      const activeItemId = String(active.id)
      const overId = String(over.id)
      const from = findItemContainer(current, activeItemId)
      const to = resolveOverContainer(current, overId)
      if (!from || !to) return

      if (from === to) {
        const ids = [...getContainerItemIds(current, from)]
        const oldIndex = ids.indexOf(activeItemId)
        let newIndex = parseContainerId(overId) ? ids.length - 1 : ids.indexOf(overId)
        if (newIndex < 0) return
        if (oldIndex < 0 || oldIndex === newIndex) return
        const reordered = arrayMove(ids, oldIndex, newIndex)
        onPreview(setContainerIds(current, from, reordered))
        return
      }

      onPreview(moveItemBetweenContainers(current, activeItemId, from, to, overId))
    },
    [onPreview],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) {
        finishDrag()
        return
      }

      const current = stateRef.current
      const activeItemId = String(active.id)
      const overId = String(over.id)
      const from = findItemContainer(current, activeItemId)
      const to = resolveOverContainer(current, overId)
      if (!from || !to) {
        finishDrag()
        return
      }

      if (from === to) {
        const ids = [...getContainerItemIds(current, from)]
        const oldIndex = ids.indexOf(activeItemId)
        let newIndex = parseContainerId(overId) ? ids.length - 1 : ids.indexOf(overId)
        if (newIndex < 0) newIndex = ids.length - 1
        if (oldIndex >= 0 && oldIndex !== newIndex) {
          onPreview(setContainerIds(current, from, arrayMove(ids, oldIndex, newIndex)))
        }
      } else {
        onPreview(moveItemBetweenContainers(current, activeItemId, from, to, overId))
      }

      finishDrag()
    },
    [onPreview, finishDrag],
  )

  const handleClearRow = useCallback(
    (tierId: string) => {
      const current = stateRef.current
      const tier = current.tiers.find((t) => t.id === tierId)
      if (!tier || tier.itemIds.length === 0) return
      onCommit(
        {
          ...current,
          unranked: [...current.unranked, ...tier.itemIds],
          tiers: current.tiers.map((t) => (t.id === tierId ? { ...t, itemIds: [] } : t)),
          updatedAt: Date.now(),
        },
        current,
      )
    },
    [onCommit],
  )

  const activeItem = activeId ? state.items[activeId] : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={tierCollisionDetection}
      onDragStart={handleDragStartWithId}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="tier-workspace">
        <section className="tier-board-scroll" aria-label="Tier list">
          <div className="tier-board">
            {state.tiers.map((tier) => (
              <TierRow key={tier.id} tier={tier} items={state.items} onClearRow={handleClearRow} />
            ))}
          </div>
        </section>
        <UnrankedTray itemIds={state.unranked} items={state.items} />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <ItemCardOverlay label={activeItem.label} imageUrl={activeItem.imageUrl} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
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
