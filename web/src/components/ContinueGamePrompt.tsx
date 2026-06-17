import './ContinueGamePrompt.css'

interface ContinueGamePromptProps {
  gameName: string
  modeLabel: string
  onContinue: () => void
  onNewGame: () => void
}

export default function ContinueGamePrompt({
  gameName,
  modeLabel,
  onContinue,
  onNewGame,
}: ContinueGamePromptProps) {
  return (
    <div className="continue-prompt" role="dialog" aria-labelledby="continue-prompt-title">
      <h2 id="continue-prompt-title" className="continue-prompt__title">
        Resume {gameName}?
      </h2>
      <p className="continue-prompt__text">
        You have a saved {modeLabel} game in progress on this device.
      </p>
      <div className="continue-prompt__actions">
        <button type="button" className="btn" onClick={onContinue}>
          Continue last game
        </button>
        <button type="button" className="btn btn-secondary" onClick={onNewGame}>
          Start new game
        </button>
      </div>
    </div>
  )
}
