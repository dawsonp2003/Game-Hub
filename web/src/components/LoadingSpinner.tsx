import './LoadingSpinner.css'

interface LoadingSpinnerProps {
  label?: string
  detail?: string
  className?: string
}

/** Centered loading indicator — use while waiting for async data before rendering a panel. */
export default function LoadingSpinner({ label, detail, className }: LoadingSpinnerProps) {
  return (
    <div
      className={['loading-spinner', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="loading-spinner__circle" aria-hidden />
      {label ? <span className="loading-spinner__label">{label}</span> : null}
      {detail ? <span className="loading-spinner__detail">{detail}</span> : null}
    </div>
  )
}
