import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import type { TierItem } from './types'
import ItemCard from './ItemCard'

interface UnrankedTrayProps {
  itemIds: string[]
  items: Record<string, TierItem>
}

export default function UnrankedTray({ itemIds, items }: UnrankedTrayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unranked' })

  return (
    <section className="tier-unranked">
      <h3 className="tier-unranked__title">Unranked ({itemIds.length})</h3>
      <div
        ref={setNodeRef}
        className={`tier-unranked__tray${isOver ? ' tier-unranked__tray--over' : ''}`}
      >
        <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
          {itemIds.map((id) => {
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
        {itemIds.length === 0 && (
          <span className="tier-unranked__empty">Drag items here to un-rank them</span>
        )}
      </div>
    </section>
  )
}
