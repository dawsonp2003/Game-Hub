import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAsyncNotificationsContext } from '../context/AsyncNotificationsContext'
import AccountModal from './AccountModal'
import './Account.css'

type AccountLocationState = { openAccount?: boolean }

export default function AccountButton() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { yourTurnCount, refresh } = useAsyncNotificationsContext()

  useEffect(() => {
    const state = location.state as AccountLocationState | null
    if (state?.openAccount) {
      setOpen(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate])

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
          👤
        </span>
        {yourTurnCount > 0 && (
          <span className="account-btn__badge" aria-label={`${yourTurnCount} async games waiting for your turn`}>
            {yourTurnCount > 9 ? '9+' : yourTurnCount}
          </span>
        )}
      </button>
      {open && (
        <AccountModal
          onClose={() => {
            setOpen(false)
            void refresh()
          }}
        />
      )}

    </>
  )
}
