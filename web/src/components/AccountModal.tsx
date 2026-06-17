import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAsyncNotificationsContext } from '../context/AsyncNotificationsContext'
import { fetchCloudStats, formatAccountGameSummary } from '../lib/stats'
import type { GameStats } from '../lib/stats'
import { localStatsStore } from '../lib/stats/local'
import { getGameById } from '../games/registry'
import {
  acceptFriendRequest,
  declineFriendRequest,
  listFriendRequests,
  listFriends,
  searchUsersByUsername,
  sendFriendRequest,
} from '../lib/friends/friends'
import { listMyAsyncInvites } from '../lib/friends/invites'
import type { AsyncMatchInvite, Friend, FriendRequest, UserSearchResult } from '../lib/friends/types'
import AsyncInviteList from './AsyncInviteList'
import AsyncMatchList from './AsyncMatchList'
import FriendDetailPanel from './FriendDetailPanel'
import SaveDataBanner from './SaveDataBanner'
import LoadingSpinner from './LoadingSpinner'
import './Account.css'
import './Friends.css'

interface AccountModalProps {
  onClose: () => void
}

type Mode = 'signin' | 'signup'
type ProfileTab = 'profile' | 'friends' | 'turns'

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
        {auth.isAnonymous
          ? 'Playing as a guest on this device. Create an account to save stats permanently.'
          : 'Save your stats across devices. You can keep playing as a guest without an account.'}
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

        <button type="submit" className="btn account-submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="account-auth-footer">
        <p className="account-auth-footer__hint">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
        </p>
        <button
          type="button"
          className="btn btn-secondary account-auth-footer__btn"
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}

function ProfilePanel({ onClose }: { onClose: () => void }) {
  const auth = useAuth()
  const {
    matches: asyncMatches,
    loading: asyncLoading,
    yourTurnCount,
    pendingFriendRequests,
    pendingAsyncInvites,
    refresh,
    refreshSocial,
  } = useAsyncNotificationsContext()
  const yourTurnMatches = asyncMatches.filter((m) => m.isMyTurn)
  const sortedAsyncMatches = [...yourTurnMatches].sort(
    (a, b) => new Date(b.lastMoveAt).getTime() - new Date(a.lastMoveAt).getTime(),
  )
  const [tab, setTab] = useState<ProfileTab>('profile')
  const [cloudStats, setCloudStats] = useState<GameStats[]>([])
  const [panelReady, setPanelReady] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(auth.profile?.username ?? '')
  const [savingName, setSavingName] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeEmail, setUpgradeEmail] = useState('')
  const [upgradePassword, setUpgradePassword] = useState('')
  const [upgradeUsername, setUpgradeUsername] = useState(auth.profile?.username ?? '')
  const [upgradeBusy, setUpgradeBusy] = useState(false)

  const refreshAll = () => {
    void refresh()
    void refreshSocial()
  }

  useEffect(() => {
    let active = true
    setPanelReady(false)

    void (async () => {
      try {
        const stats = auth.isAnonymous
          ? localStatsStore.getAllStats()
          : await fetchCloudStats()
        await auth.refreshProfile()
        if (!active) return
        setCloudStats(stats)
        setPanelReady(true)
      } catch {
        if (active) {
          setCloudStats(auth.isAnonymous ? localStatsStore.getAllStats() : [])
          setPanelReady(true)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [auth.user?.id, auth.isAnonymous, auth.refreshProfile])

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

  const turnsBadge = yourTurnCount + pendingAsyncInvites

  if (!panelReady) {
    return (
      <div className="account-panel">
        <LoadingSpinner label="Loading account…" className="loading-spinner--modal" />
      </div>
    )
  }

  return (
    <div className="account-panel">
      {auth.isAnonymous && (
        <SaveDataBanner
          onCreateAccount={() => setShowUpgrade(true)}
        />
      )}

      {showUpgrade && auth.isAnonymous && (
        <form
          className="account-form account-form--upgrade"
          onSubmit={(e) => {
            e.preventDefault()
            setUpgradeBusy(true)
            setError(null)
            void auth
              .signUp(upgradeEmail, upgradePassword, upgradeUsername)
              .then(() => setShowUpgrade(false))
              .catch((err) => setError(err instanceof Error ? err.message : 'Could not create account'))
              .finally(() => setUpgradeBusy(false))
          }}
        >
          <p className="account-panel__subtitle">Create a permanent account — your local stats stay on this device until you play again.</p>
          <label className="account-field">
            <span>Profile name</span>
            <input
              className="account-input"
              value={upgradeUsername}
              onChange={(e) => setUpgradeUsername(e.target.value)}
              required
            />
          </label>
          <label className="account-field">
            <span>Email</span>
            <input
              className="account-input"
              type="email"
              value={upgradeEmail}
              onChange={(e) => setUpgradeEmail(e.target.value)}
              required
            />
          </label>
          <label className="account-field">
            <span>Password</span>
            <input
              className="account-input"
              type="password"
              value={upgradePassword}
              onChange={(e) => setUpgradePassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <button type="submit" className="btn account-submit" disabled={upgradeBusy}>
            {upgradeBusy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}

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

      <div className="account-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`account-tab ${tab === 'profile' ? 'account-tab--active' : ''}`}
          aria-selected={tab === 'profile'}
          onClick={() => setTab('profile')}
        >
          Profile
        </button>
        <button
          type="button"
          role="tab"
          className={`account-tab ${tab === 'friends' ? 'account-tab--active' : ''}`}
          aria-selected={tab === 'friends'}
          onClick={() => setTab('friends')}
        >
          Friends
          {pendingFriendRequests > 0 && (
            <span className="account-tab__badge">{pendingFriendRequests}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          className={`account-tab ${tab === 'turns' ? 'account-tab--active' : ''}`}
          aria-selected={tab === 'turns'}
          onClick={() => setTab('turns')}
        >
          Your turn
          {turnsBadge > 0 && <span className="account-tab__badge">{turnsBadge}</span>}
        </button>
      </div>

      {tab === 'profile' && (
        <>
          <div className="account-summary">
            <div className="account-summary__item">
              <span className="account-summary__value">{auth.profile?.totalGamesPlayed ?? 0}</span>
              <span className="account-summary__label">Games played</span>
            </div>
            <div className="account-summary__item">
              <span className="account-summary__value">{cloudStats.length}</span>
              <span className="account-summary__label">Games tried</span>
            </div>
          </div>

          <h3 className="account-section__title">Per-game stats</h3>
          {cloudStats.length === 0 ? (
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
                      {formatAccountGameSummary(s.gameId, s)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {tab === 'friends' && <FriendsTab onChanged={refreshAll} />}

      {tab === 'turns' && (
        <TurnsTab
          asyncMatches={sortedAsyncMatches}
          asyncLoading={asyncLoading}
          onClose={onClose}
          onChanged={refreshAll}
        />
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

function FriendsTab({ onChanged }: { onChanged: () => void }) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [f, r] = await Promise.all([listFriends(), listFriendRequests()])
      setFriends(f)
      setRequests(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load friends')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSearch = async () => {
    const q = query.trim()
    if (q.length < 3) {
      setError('Enter at least 3 characters to search.')
      setSearchResults([])
      return
    }
    setSearching(true)
    setError(null)
    try {
      const results = await searchUsersByUsername(q)
      setSearchResults(results)
      if (results.length === 0) setError('No users found.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleSendRequest = async (userId: string) => {
    setBusy(true)
    setError(null)
    try {
      await sendFriendRequest(userId)
      setSearchResults((prev) => prev.filter((u) => u.id !== userId))
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send request')
    } finally {
      setBusy(false)
    }
  }

  const handleAccept = async (requesterId: string) => {
    setBusy(true)
    setError(null)
    try {
      await acceptFriendRequest(requesterId)
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept request')
    } finally {
      setBusy(false)
    }
  }

  const handleDecline = async (requesterId: string) => {
    setBusy(true)
    setError(null)
    try {
      await declineFriendRequest(requesterId)
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decline request')
    } finally {
      setBusy(false)
    }
  }

  if (selectedFriend) {
    return (
      <FriendDetailPanel
        friend={selectedFriend}
        onBack={() => setSelectedFriend(null)}
        onChanged={() => {
          void load()
          onChanged()
        }}
      />
    )
  }

  if (loading) {
    return <LoadingSpinner label="Loading friends…" className="loading-spinner--tab" />
  }

  return (
    <>
      {error && <p className="account-error">{error}</p>}

      <section>
        <h3 className="account-section__title">Add friend</h3>
        <div className="friends-search">
          <input
            className="account-input friends-search__input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearch()
            }}
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={searching}
            onClick={() => void handleSearch()}
          >
            {searching ? '…' : 'Search'}
          </button>
        </div>
        {searchResults.length > 0 && (
          <ul className="friends-list">
            {searchResults.map((u) => (
              <li key={u.id} className="friends-list__row">
                <span className="friends-list__name">{u.username}</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => void handleSendRequest(u.id)}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {requests.length > 0 && (
        <section>
          <h3 className="account-section__title">Friend requests</h3>
          <ul className="friends-list">
            {requests.map((r) => (
              <li key={r.requesterId} className="friends-list__row">
                <span className="friends-list__name">{r.username}</span>
                <div className="friends-list__actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => void handleAccept(r.requesterId)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void handleDecline(r.requesterId)}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="account-section__title">Friends</h3>
        {friends.length === 0 ? (
          <p className="account-panel__subtitle">No friends yet. Search above to add someone.</p>
        ) : (
          <ul className="friends-list">
            {friends.map((f) => (
              <li key={f.userId} className="friends-list__row">
                <button
                  type="button"
                  className="friends-list__name"
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'inherit', cursor: 'pointer' }}
                  onClick={() => setSelectedFriend(f)}
                >
                  {f.username}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedFriend(f)}
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function TurnsTab({
  asyncMatches,
  asyncLoading,
  onClose,
  onChanged,
}: {
  asyncMatches: ReturnType<typeof useAsyncNotificationsContext>['matches']
  asyncLoading: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [invites, setInvites] = useState<AsyncMatchInvite[]>([])
  const [invitesLoading, setInvitesLoading] = useState(true)

  useEffect(() => {
    let active = true
    setInvitesLoading(true)
    void listMyAsyncInvites()
      .then((rows) => {
        if (active) setInvites(rows)
      })
      .catch(() => {
        if (active) setInvites([])
      })
      .finally(() => {
        if (active) setInvitesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleInviteChanged = () => {
    void listMyAsyncInvites().then(setInvites)
    onChanged()
  }

  if (invitesLoading || asyncLoading) {
    return <LoadingSpinner label="Loading games…" className="loading-spinner--tab" />
  }

  return (
    <>
      {invites.length > 0 ? (
        <section className="account-async">
          <h3 className="account-section__title">Game invites</h3>
          <AsyncInviteList
            invites={invites}
            onChanged={handleInviteChanged}
            onContinue={onClose}
          />
        </section>
      ) : null}

      <section className="account-async">
        <h3 className="account-section__title">Your turn</h3>
        <AsyncMatchList
          matches={asyncMatches}
          showGameName
          emptyMessage="No games waiting on your move."
          onContinue={onClose}
        />
      </section>
    </>
  )
}
