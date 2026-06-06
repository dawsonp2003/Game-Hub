import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchCloudStats } from '../lib/stats'
import type { GameStats } from '../lib/stats'
import { getGameById } from '../games/registry'
import './Account.css'

interface AccountModalProps {
  onClose: () => void
}

type Mode = 'signin' | 'signup'

function winRate(s: GameStats): string {
  const decided = s.wins + s.losses
  if (decided === 0) return '—'
  return `${Math.round((s.wins / decided) * 100)}%`
}

export default function AccountModal({ onClose }: AccountModalProps) {
  const auth = useAuth()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="account-modal" role="presentation">
      <button
        type="button"
        className="account-modal__backdrop"
        onClick={onClose}
        aria-label="Close account panel"
      />
      <div className="account-modal__dialog" role="dialog" aria-modal="true" aria-label="Account">
        {auth.user ? <ProfilePanel onClose={onClose} /> : <AuthPanel />}
      </div>
    </div>
  )
}

function AuthPanel() {
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signup') {
        await auth.signUp(email, password, username)
        if (!auth.user) {
          setNotice(
            'Account created. Email confirmation is enabled — check your inbox for a confirmation link, then sign in.',
          )
          setMode('signin')
        }
      } else {
        await auth.signIn(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-panel">
      <h2 className="account-panel__title">{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
      <p className="account-panel__subtitle">
        Save your stats across devices. You can keep playing as a guest without an account.
      </p>

      <form className="account-form" onSubmit={submit}>
        {mode === 'signup' && (
          <label className="account-field">
            <span>Profile name</span>
            <input
              className="account-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. dawson"
              autoComplete="username"
              required
            />
          </label>
        )}
        <label className="account-field">
          <span>Email</span>
          <input
            className="account-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="account-field">
          <span>Password</span>
          <input
            className="account-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>

        {error && <p className="account-error">{error}</p>}
        {notice && <p className="account-notice">{notice}</p>}

        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        className="account-switch"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
          setError(null)
          setNotice(null)
        }}
      >
        {mode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}

function ProfilePanel({ onClose }: { onClose: () => void }) {
  const auth = useAuth()
  const [cloudStats, setCloudStats] = useState<GameStats[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(auth.profile?.username ?? '')
  const [savingName, setSavingName] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void auth.refreshProfile()
    fetchCloudStats().then((rows) => {
      if (active) setCloudStats(rows)
    })
    return () => {
      active = false
    }
  }, [auth.user?.id, auth.refreshProfile])

  const saveName = async () => {
    setSavingName(true)
    setError(null)
    try {
      await auth.updateUsername(nameDraft)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update name.')
    } finally {
      setSavingName(false)
    }
  }

  const memberSince = auth.profile?.createdAt
    ? new Date(auth.profile.createdAt).toLocaleDateString()
    : null

  return (
    <div className="account-panel">
      <div className="account-profile__head">
        {editing ? (
          <div className="account-profile__edit">
            <input
              className="account-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={40}
            />
            <div className="account-profile__edit-actions">
              <button type="button" className="btn btn-sm" onClick={saveName} disabled={savingName}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditing(false)
                  setNameDraft(auth.profile?.username ?? '')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <h2 className="account-panel__title">
            {auth.profile?.username ?? 'Player'}{' '}
            <button
              type="button"
              className="account-edit-btn"
              onClick={() => setEditing(true)}
              aria-label="Edit profile name"
            >
              ✎
            </button>
          </h2>
        )}
        {memberSince && <p className="account-panel__subtitle">Member since {memberSince}</p>}
      </div>

      {error && <p className="account-error">{error}</p>}

      <div className="account-summary">
        <div className="account-summary__item">
          <span className="account-summary__value">{auth.profile?.totalGamesPlayed ?? 0}</span>
          <span className="account-summary__label">Games played</span>
        </div>
        <div className="account-summary__item">
          <span className="account-summary__value">{cloudStats?.length ?? 0}</span>
          <span className="account-summary__label">Games tried</span>
        </div>
      </div>

      <h3 className="account-section__title">Per-game stats</h3>
      {cloudStats === null ? (
        <p className="account-panel__subtitle">Loading…</p>
      ) : cloudStats.length === 0 ? (
        <p className="account-panel__subtitle">No games recorded yet. Go play something!</p>
      ) : (
        <ul className="account-stats">
          {cloudStats.map((s) => {
            const game = getGameById(s.gameId)
            return (
              <li key={s.gameId} className="account-stats__row">
                <span className="account-stats__name">
                  {game ? `${game.icon} ${game.name}` : s.gameId}
                </span>
                <span className="account-stats__meta">
                  {s.plays} plays · {winRate(s)} win
                  {typeof s.rating === 'number' ? ` · ${s.rating} rating` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <button
        type="button"
        className="btn btn-secondary account-signout"
        onClick={async () => {
          await auth.signOut()
          onClose()
        }}
      >
        Sign out
      </button>
    </div>
  )
}
