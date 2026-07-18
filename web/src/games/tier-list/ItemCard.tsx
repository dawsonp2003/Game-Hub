import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface ItemCardProps {
  id: string
  label: string
  imageUrl?: string
  description?: string
  dragging?: boolean
}

export default function ItemCard({ id, label, imageUrl, description, dragging }: ItemCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const tooltipId = `tier-item-tooltip-${id}`

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tier-item${dragging ? ' tier-item--overlay' : ''}`}
      {...attributes}
      {...listeners}
      aria-label={description ? `${label}. ${description}` : label}
      aria-describedby={tooltipId}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="tier-item__img" crossOrigin="anonymous" draggable={false} />
      ) : (
        <span className="tier-item__text">{label}</span>
      )}
      <span id={tooltipId} className="tier-item__tooltip" role="tooltip">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </span>
    </div>
  )
}

export function ItemCardOverlay({ label, imageUrl }: { label: string; imageUrl?: string }) {
  return (
    <div className="tier-item tier-item--overlay">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="tier-item__img" crossOrigin="anonymous" draggable={false} />
      ) : (
        <span className="tier-item__text">{label}</span>
      )}
    </div>
  )
}
