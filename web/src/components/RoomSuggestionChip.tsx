import { useRoom } from '../context/RoomContext'
import './RoomMenuButton.css'

export default function RoomSuggestionChip() {
  const room = useRoom()

  const show =
    room.role === 'host' && !!room.suggestion && !room.roomPanelOpen

  if (!show || !room.suggestion) return null

  const handleClick = () => {
    room.acceptSuggestion()
    room.setRoomPanelOpen(false)
  }

  return (
    <button type="button" className="room-suggest-chip" onClick={handleClick}>
      <span className="room-suggest-chip__title">
        Friend suggests <strong>{room.suggestion.gameName}</strong>
      </span>
      <span className="room-suggest-chip__action">Tap to view →</span>
    </button>
  )
}
