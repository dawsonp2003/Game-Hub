import './SaveDataBanner.css'

interface SaveDataBannerProps {
  onCreateAccount: () => void
  compact?: boolean
  message?: string
}

/** Prompts anonymous players to create a permanent account so stats sync across devices. */
export default function SaveDataBanner({
  onCreateAccount,
  compact = false,
  message = 'Stats and game history on this device are temporary. Create an account to save them permanently and sync across devices.',
}: SaveDataBannerProps) {
  return (
    <div className={`save-data-banner${compact ? ' save-data-banner--compact' : ''}`} role="status">
      <p className="save-data-banner__text">{message}</p>
      <button type="button" className="btn btn-secondary save-data-banner__btn" onClick={onCreateAccount}>
        Create account
      </button>
    </div>
  )
}
