import { useRoom } from '../context/RoomContext'
import './RoomMenuButton.css'

export default function RoomMenuButton() {
  const room = useRoom()

  const showSuggestion =
    room.role === 'host' && !!room.suggestion && !room.roomPanelOpen

  const fabLabel = room.isInRoom
    ? `Room ${room.roomCode}, ${room.status === 'connected' ? 'connected' : room.statusMessage || 'in room'}`
    : 'Play with a friend'

  return (
    <button
      type="button"
      className={`room-menu-btn ${room.isInRoom ? 'room-menu-btn--active' : ''} ${room.loading ? 'room-menu-btn--loading' : ''}`}
      onClick={() => room.setRoomPanelOpen(!room.roomPanelOpen)}
      aria-label={fabLabel}
      aria-expanded={room.roomPanelOpen}
      aria-haspopup="dialog"
    >
      {room.isInRoom ? (
        <>
          <span className="room-menu-btn__icon" aria-hidden>
            👥
          </span>
          <span className="room-menu-btn__code">{room.roomCode}</span>
        </>
      ) : (
        <span className="room-menu-btn__icon" aria-hidden>
          👥
        </span>
      )}
      {(showSuggestion || (room.isInRoom && room.status === 'connected')) && (
        <span
          className={`room-menu-btn__dot ${showSuggestion ? 'room-menu-btn__dot--suggest' : ''}`}
          aria-hidden
        />
      )}
    </button>
  )
}
