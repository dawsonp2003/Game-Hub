import { useState } from 'react'
import './RemoteLobby.css'

interface RemoteLobbyProps {
  loading: boolean
  error: string | null
  status: string
  roomCode: string | null
  onHost: () => void
  onJoin: (code: string) => void
  onBack: () => void
}

export default function RemoteLobby({
  loading,
  error,
  status,
  roomCode,
  onHost,
  onJoin,
  onBack,
}: RemoteLobbyProps) {
  const [joinCode, setJoinCode] = useState('')

  return (
    <div className="remote-lobby">
      <h2 className="remote-lobby__title">Remote Play</h2>
      <p className="remote-lobby__hint">
        One player creates a room and shares the 6-digit code. The other enters it to connect
        directly (peer-to-peer).
      </p>

      {error && <p className="remote-lobby__error">{error}</p>}
      {status && <p className="remote-lobby__status">{status}</p>}

      {roomCode ? (
        <div className="remote-lobby__code-display">
          <span className="remote-lobby__code-label">Room code</span>
          <span className="remote-lobby__code">{roomCode}</span>
          <p className="remote-lobby__waiting">Waiting for friend to join…</p>
        </div>
      ) : (
        <>
          <button type="button" className="btn remote-lobby__action" onClick={onHost} disabled={loading}>
            Create Room
          </button>

          <div className="remote-lobby__divider">or join</div>

          <input
            className="input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-label="Room code"
          />
          <button
            type="button"
            className="btn remote-lobby__action"
            onClick={() => onJoin(joinCode)}
            disabled={loading || joinCode.length !== 6}
          >
            Join Room
          </button>
        </>
      )}

      <button type="button" className="btn btn-ghost remote-lobby__back" onClick={onBack}>
        Back
      </button>
    </div>
  )
}
