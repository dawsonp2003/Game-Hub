import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AccountModal from './AccountModal'
import './Account.css'

export default function AccountButton() {
  const auth = useAuth()
  const [open, setOpen] = useState(false)

  // Hide entirely in builds where Supabase isn't configured (guest-only).
  if (!auth.enabled) return null

  const label = auth.user ? auth.profile?.username ?? 'Account' : 'Sign in'

  return (
    <>
      <button
        type="button"
        className={`account-btn ${auth.user ? 'account-btn--active' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={auth.user ? `Account: ${label}` : 'Sign in'}
        aria-haspopup="dialog"
      >
        <span className="account-btn__icon" aria-hidden>
          {auth.user ? '🙂' : '👤'}
        </span>
        <span className="account-btn__label">{label}</span>
      </button>
      {open && <AccountModal onClose={() => setOpen(false)} />}
    </>
  )
}
