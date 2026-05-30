import { useEffect, useState } from 'react'
import { checkSignalingHealth, getSignalingUrl } from '../lib/multiplayer/signaling'
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
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null)
  const [checking, setChecking] = useState(true)

  let signalingUrl = ''
  try {
    signalingUrl = getSignalingUrl()
  } catch {
    signalingUrl = '(not configured)'
  }

  const runHealthCheck = async () => {
    setChecking(true)
    const result = await checkSignalingHealth()
    setHealth({ ok: result.ok, message: result.message })
    setChecking(false)
  }

  useEffect(() => {
    runHealthCheck()
  }, [])

  return (
    <div className="remote-lobby">
      <h2 className="remote-lobby__title">Remote Play</h2>
      <p className="remote-lobby__hint">
        One player creates a room and shares the 6-digit code. The other enters it to connect
        directly (peer-to-peer).
      </p>

      <div className="remote-lobby__diag">
        <span className="remote-lobby__diag-label">Signaling server</span>
        <code className="remote-lobby__diag-url">{signalingUrl}</code>
        {checking ? (
          <p className="remote-lobby__diag-status">Checking connection…</p>
        ) : health ? (
          <p
            className={`remote-lobby__diag-status ${health.ok ? 'ok' : 'bad'}`}
          >
            {health.message}
          </p>
        ) : null}
        {!checking && (
          <button type="button" className="btn btn-secondary remote-lobby__recheck" onClick={runHealthCheck}>
            Re-check server
          </button>
        )}
      </div>

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

      <details className="remote-lobby__help">
        <summary>Laptop not connecting?</summary>
        <ul>
          <li>Hard refresh: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (clears cached old app)</li>
          <li>Try an incognito/private window</li>
          <li>Disable ad blockers or VPN for this site</li>
          <li>In DevTools → Application → Service Workers → Unregister, then reload</li>
          <li>Confirm the URL above ends in <code>-signaling.onrender.com</code>, not <code>-web</code></li>
        </ul>
      </details>

      <button type="button" className="btn btn-ghost remote-lobby__back" onClick={onBack}>
        Back
      </button>
    </div>
  )
}
