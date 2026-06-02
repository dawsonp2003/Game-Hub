import { useEffect } from 'react'
import { useRoom } from '../context/RoomContext'
import RoomPanel from './RoomPanel'
import './RoomOverlay.css'

/** Full-screen modal for the room panel (trigger lives in MenuGrid / GameShell headers). */
export default function RoomOverlay() {
  const room = useRoom()

  useEffect(() => {
    if (!room.roomPanelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') room.setRoomPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [room.roomPanelOpen, room])

  if (!room.roomPanelOpen) return null

  return (
    <div className="room-overlay__modal" role="presentation">
      <button
        type="button"
        className="room-overlay__backdrop"
        onClick={() => room.setRoomPanelOpen(false)}
        aria-label="Close room panel"
      />
      <div className="room-overlay__dialog" role="dialog" aria-modal="true" aria-label="Multiplayer room">
        <RoomPanel onClose={() => room.setRoomPanelOpen(false)} />
      </div>
    </div>
  )
}
