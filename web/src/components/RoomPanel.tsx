import { useEffect, useState } from 'react'
import { useRoom } from '../context/RoomContext'
import { loadRoomPrefs } from '../lib/multiplayer/room'
import { checkSignalingHealth, getSignalingUrl } from '../lib/multiplayer/signaling'
import { parseRoomCodeFromSearch } from '../lib/multiplayer/room-link'
import ShareRoomButton from './ShareRoomButton'
import './RoomPanel.css'

interface RoomPanelProps {
  onClose?: () => void
}

function Spinner() {
  return <span className="room-panel__spinner" aria-hidden="true" />
}

function progressLabel(
  pendingAction: ReturnType<typeof useRoom>['pendingAction'],
  statusMessage: string,
): string {
  if (statusMessage) return statusMessage
  if (pendingAction === 'create') return 'Creating your room…'
  if (pendingAction === 'join') return 'Joining room…'
  if (pendingAction === 'restore') return 'Restoring your session…'
  return ''
}

export default function RoomPanel({ onClose }: RoomPanelProps) {
  const room = useRoom()
  const [joinCode, setJoinCode] = useState(() => parseRoomCodeFromSearch(window.location.search) ?? '')
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    const code = parseRoomCodeFromSearch(window.location.search)
    if (code) setJoinCode(code)
  }, [])

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

  const isBusy = room.loading && room.pendingAction !== 'restore'
  const progressText = progressLabel(room.pendingAction, room.statusMessage)
  const savedRoom = loadRoomPrefs()

  if (room.isInRoom) {
    return (
      <section className="room-panel room-panel--active" aria-label="Multiplayer room">
        <div className="room-panel__topbar">
          <div className="room-panel__header">
            <span className="room-panel__badge">Room</span>
            <span className="room-panel__code">{room.roomCode}</span>
          </div>
          <div className="room-panel__topbar-actions">
            {room.role === 'host' && <span className="room-panel__role">Host</span>}
            {room.role === 'guest' && <span className="room-panel__role">Guest</span>}
            {onClose && (
              <button type="button" className="room-panel__close btn-ghost" onClick={onClose} aria-label="Close">
                ×
              </button>
            )}
          </div>
        </div>

        {room.loading && (
          <div className="room-panel__progress" role="status" aria-live="polite">
            <Spinner />
            <span>{progressText || 'Working…'}</span>
          </div>
        )}

        {!room.loading && room.status !== 'waiting' && (
          <p className={`room-panel__status room-panel__status--${room.status}`}>
            {room.statusMessage || 'In room'}
          </p>
        )}

        {room.role === 'host' && room.suggestion && (
          <div className="room-panel__suggestion">
            <p className="room-panel__suggestion-text">
              Friend suggests: <strong>{room.suggestion.gameName}</strong>
            </p>
            <div className="room-panel__suggestion-actions">
              <button type="button" className="btn" onClick={room.acceptSuggestion}>
                Play {room.suggestion.gameName}
              </button>
              <button type="button" className="btn btn-secondary" onClick={room.dismissSuggestion}>
                Choose different
              </button>
            </div>
          </div>
        )}

        {room.role === 'guest' && room.lastSuggested && (
          <p className="room-panel__hint">
            You suggested <strong>{room.lastSuggested.gameName}</strong> — waiting for host.
          </p>
        )}

        {room.role === 'host' && room.status === 'connected' && !room.suggestion && (
          <p className="room-panel__hint">You choose the game — tap a title below. Friends can suggest.</p>
        )}

        {room.role === 'guest' && room.status === 'connected' && (
          <p className="room-panel__hint">Tap a game to suggest it to the host.</p>
        )}

        {room.status === 'waiting' && !room.loading && (
          <p className="room-panel__hint">Send the invite link so friends can join in one tap.</p>
        )}

        {room.roomCode && <ShareRoomButton roomCode={room.roomCode} />}

        {room.status === 'peer-away' && room.peerAwayUntil && (
          <p className="room-panel__hint">
            Friend can rejoin with the same code for ~
            {Math.max(0, Math.ceil((room.peerAwayUntil - Date.now()) / 1000))}s.
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
    <section className={`room-panel ${isBusy ? 'room-panel--busy' : ''}`} aria-label="Play with a friend">
      <div className="room-panel__topbar">
        <h2 className="room-panel__title">Play with a friend</h2>
        {onClose && (
          <button type="button" className="room-panel__close btn-ghost" onClick={onClose} disabled={isBusy} aria-label="Close">
            ×
          </button>
        )}
      </div>

      <p className="room-panel__intro">
        Create or join a room, then pick a game together. Host chooses; guests can suggest.
      </p>

      {(isBusy || progressText) && (
        <div className="room-panel__progress" role="status" aria-live="polite">
          {isBusy && <Spinner />}
          <span>{progressText || 'Working…'}</span>
        </div>
      )}

      {!isBusy && !room.error && !parseRoomCodeFromSearch(window.location.search) && (
        <p className="room-panel__idle-hint">Tap a button below to get started.</p>
      )}

      {room.error && <p className="room-panel__error">{room.error}</p>}

      {savedRoom && !room.loading && (
        <div className="room-panel__rejoin">
          <p className="room-panel__hint">
            You may still be in room <strong>{savedRoom.code}</strong> from this tab.
          </p>
          <button type="button" className="btn btn-secondary room-panel__btn" onClick={room.rejoinRoom}>
            Rejoin room {savedRoom.code}
          </button>
        </div>
      )}

      <button
        type="button"
        className={`btn room-panel__btn ${room.pendingAction === 'create' ? 'room-panel__btn--loading' : ''}`}
        onClick={room.createRoom}
        disabled={room.loading}
        aria-busy={room.pendingAction === 'create'}
      >
        {room.pendingAction === 'create' && <Spinner />}
        {room.pendingAction === 'create' ? 'Creating room…' : 'Create room'}
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' && joinCode.length === 6 && !room.loading) {
            room.joinRoom(joinCode)
          }
        }}
        disabled={room.loading}
        aria-label="Room code"
      />
      <button
        type="button"
        className={`btn room-panel__btn ${room.pendingAction === 'join' ? 'room-panel__btn--loading' : ''}`}
        onClick={() => room.joinRoom(joinCode)}
        disabled={room.loading || joinCode.length !== 6}
        aria-busy={room.pendingAction === 'join'}
      >
        {room.pendingAction === 'join' && <Spinner />}
        {room.pendingAction === 'join' ? 'Joining room…' : 'Join room'}
      </button>

      <details className="room-panel__diag">
        <summary>Connection help</summary>
        <p className="room-panel__diag-url">
          Server: <code>{signalingUrl}</code>
        </p>
        <button
          type="button"
          className="btn btn-secondary room-panel__diag-btn"
          onClick={checkHealth}
          disabled={room.loading}
        >
          Test server
        </button>
        {health && (
          <p className={health.ok ? 'room-panel__ok' : 'room-panel__error'}>{health.message}</p>
        )}
      </details>
    </section>
  )
}
