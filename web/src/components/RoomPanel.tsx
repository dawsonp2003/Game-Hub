import { useState } from 'react'
import { useRoom } from '../context/RoomContext'
import { checkSignalingHealth, getSignalingUrl } from '../lib/multiplayer/signaling'
import './RoomPanel.css'

export default function RoomPanel() {
  const room = useRoom()
  const [joinCode, setJoinCode] = useState('')
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null)

  let signalingUrl = ''
  try {
    signalingUrl = getSignalingUrl()
  } catch {
    signalingUrl = '(not configured)'
  }

  const checkHealth = async () => {
    const result = await checkSignalingHealth()
    setHealth({ ok: result.ok, message: result.message })
  }

  if (room.isInRoom) {
    return (
      <section className="room-panel room-panel--active" aria-label="Multiplayer room">
        <div className="room-panel__header">
          <span className="room-panel__badge">Room</span>
          <span className="room-panel__code">{room.roomCode}</span>
          {room.role === 'host' && <span className="room-panel__role">Host</span>}
          {room.role === 'guest' && <span className="room-panel__role">Guest</span>}
        </div>

        <p className={`room-panel__status room-panel__status--${room.status}`}>
          {room.statusMessage || 'In room'}
        </p>

        {room.status === 'connected' && (
          <p className="room-panel__hint">Pick any multiplayer game below to play together.</p>
        )}

        {room.status === 'waiting' && (
          <p className="room-panel__hint">Share the code above. You can browse games while you wait.</p>
        )}

        {room.status === 'peer-away' && room.peerAwayUntil && (
          <p className="room-panel__hint">
            Friend can rejoin with the same code for ~
            {Math.max(0, Math.ceil((room.peerAwayUntil - Date.now()) / 1000))}s. Game progress is
            kept.
          </p>
        )}

        {room.error && <p className="room-panel__error">{room.error}</p>}

        <div className="room-panel__actions">
          <button type="button" className="btn btn-secondary" onClick={room.leaveRoom} disabled={room.loading}>
            Leave room
          </button>
          {room.role === 'host' && (
            <button type="button" className="btn btn-ghost" onClick={room.closeRoom} disabled={room.loading}>
              Close room for everyone
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="room-panel" aria-label="Play with a friend">
      <h2 className="room-panel__title">Play with a friend</h2>
      <p className="room-panel__intro">
        Create or join a room here first, then pick a game. Friends can leave and rejoin within 60
        seconds.
      </p>

      {room.error && <p className="room-panel__error">{room.error}</p>}

      <button type="button" className="btn room-panel__btn" onClick={room.createRoom} disabled={room.loading}>
        Create room
      </button>

      <div className="room-panel__divider">or join with code</div>

      <input
        className="input"
        type="text"
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-label="Room code"
      />
      <button
        type="button"
        className="btn room-panel__btn"
        onClick={() => room.joinRoom(joinCode)}
        disabled={room.loading || joinCode.length !== 6}
      >
        Join room
      </button>

      <details className="room-panel__diag">
        <summary>Connection help</summary>
        <p className="room-panel__diag-url">
          Server: <code>{signalingUrl}</code>
        </p>
        <button type="button" className="btn btn-secondary room-panel__diag-btn" onClick={checkHealth}>
          Test server
        </button>
        {health && (
          <p className={health.ok ? 'room-panel__ok' : 'room-panel__error'}>{health.message}</p>
        )}
      </details>
    </section>
  )
}
