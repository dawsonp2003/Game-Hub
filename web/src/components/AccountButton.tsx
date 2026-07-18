import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAsyncNotificationsContext } from '../context/AsyncNotificationsContext'
import AccountModal from './AccountModal'
import './Account.css'

type AccountLocationState = { openAccount?: boolean }
type AuthMode = 'signin' | 'signup'

export default function AccountButton() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const { accountBadgeCount, refresh } = useAsyncNotificationsContext()

  useEffect(() => {
    const state = location.state as AccountLocationState | null
    if (state?.openAccount) {
      setAuthMode('signin')
      setOpen(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate])

  // Hide entirely in builds where Supabase isn't configured (guest-only).
  if (!auth.enabled) return null

  const label = auth.profile?.username ?? 'Account'

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode)
    setOpen(true)
  }

  return (
    <>
      {auth.isPermanent ? (
        <button
          type="button"
          className="account-btn account-btn--active"
          onClick={() => setOpen(true)}
          aria-label={`Account: ${label}`}
          aria-haspopup="dialog"
        >
          <span className="account-btn__icon" aria-hidden>
            👤
          </span>
          {accountBadgeCount > 0 && (
            <span
              className="account-btn__badge"
              aria-label={`${accountBadgeCount} notifications`}
            >
              {accountBadgeCount > 9 ? '9+' : accountBadgeCount}
            </span>
          )}
        </button>
      ) : (
        <div className="account-auth-actions">
          <button
            type="button"
            className="btn btn-secondary account-auth-actions__login"
            onClick={() => openAuth('signin')}
            aria-haspopup="dialog"
          >
            Log in
          </button>
          <button
            type="button"
            className="btn account-auth-actions__signup"
            onClick={() => openAuth('signup')}
            aria-haspopup="dialog"
          >
            Sign up
          </button>
        </div>
      )}
      {open && (
        <AccountModal
          initialMode={authMode}
          onClose={() => {
            setOpen(false)
            void refresh()
          }}
        />
      )}

    </>
  )
}
