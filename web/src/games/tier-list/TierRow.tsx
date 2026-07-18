import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import type { Tier, TierItem } from './types'
import { tierContainerId } from './types'
import ItemCard from './ItemCard'

interface TierRowProps {
  tier: Tier
  items: Record<string, TierItem>
  onClearRow: (tierId: string) => void
}

export default function TierRow({ tier, items, onClearRow }: TierRowProps) {
  const containerId = tierContainerId(tier.id)
  const { setNodeRef, isOver } = useDroppable({ id: containerId })

  return (
    <div className="tier-row">
      <div className="tier-row__label" style={{ backgroundColor: tier.color }}>
        {tier.label}
      </div>
      <div
        ref={setNodeRef}
        className={`tier-row__items${isOver ? ' tier-row__items--over' : ''}`}
      >
        <SortableContext items={tier.itemIds} strategy={horizontalListSortingStrategy}>
          {tier.itemIds.map((id) => {
            const item = items[id]
            if (!item) return null
            return (
              <ItemCard
                key={id}
                id={id}
                label={item.label}
                imageUrl={item.imageUrl}
                description={item.description}
              />
            )
          })}
        </SortableContext>
        {tier.itemIds.length === 0 && <span className="tier-row__placeholder">Drop here</span>}
      </div>
      {tier.itemIds.length > 0 && (
        <button
          type="button"
          className="tier-row__clear btn-ghost"
          onClick={() => onClearRow(tier.id)}
          aria-label={`Clear ${tier.label} tier`}
          title="Return all items to pool"
        >
          ↩
        </button>
      )}
    </div>
  )
}
