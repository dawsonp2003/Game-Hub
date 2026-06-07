import { useEffect } from 'react'
import './GameHowToModal.css'

interface GameHowToModalProps {
  gameName: string
  howToPlay: string
  onClose: () => void
}

export default function GameHowToModal({ gameName, howToPlay, onClose }: GameHowToModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="game-howto-modal" role="presentation">
      <button type="button" className="game-howto-modal__backdrop" aria-label="Close" onClick={onClose} />
      <div
        className="game-howto-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-howto-title"
      >
        <header className="game-howto-modal__header">
          <h2 id="game-howto-title" className="game-howto-modal__title">
            How to play {gameName}
          </h2>
          <button type="button" className="game-howto-modal__close btn-ghost" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <p className="game-howto-modal__body">{howToPlay}</p>
      </div>
    </div>
  )
}
