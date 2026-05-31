import { useState } from 'react'
import { canUseNativeShare, copyRoomLink, shareRoomLink } from '../lib/multiplayer/room-link'
import './ShareRoomButton.css'

interface ShareRoomButtonProps {
  roomCode: string
  className?: string
}

export default function ShareRoomButton({ roomCode, className = '' }: ShareRoomButtonProps) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const nativeShare = canUseNativeShare()

  const showFeedback = (message: string) => {
    setFeedback(message)
    window.setTimeout(() => setFeedback(null), 2500)
  }

  const handleCopy = async () => {
    try {
      await copyRoomLink(roomCode)
      showFeedback('Link copied!')
    } catch {
      showFeedback('Could not copy — try again')
    }
  }

  const handleShare = async () => {
    try {
      await shareRoomLink(roomCode)
      showFeedback('Shared!')
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      showFeedback(e instanceof Error ? e.message : 'Could not share')
    }
  }

  return (
    <div className={`share-room ${className}`.trim()}>
      <div className="share-room__actions">
        <button type="button" className="btn btn-secondary share-room__btn" onClick={handleCopy}>
          Copy link
        </button>
        <button
          type="button"
          className="btn share-room__btn"
          onClick={handleShare}
          disabled={!nativeShare}
          title={nativeShare ? undefined : 'Sharing is not available in this browser'}
        >
          Share…
        </button>
      </div>
      {!nativeShare && (
        <p className="share-room__hint">Use Copy link on desktop, or open on your phone to use Share.</p>
      )}
      {feedback && (
        <p className="share-room__feedback" role="status" aria-live="polite">
          {feedback}
        </p>
      )}
    </div>
  )
}
