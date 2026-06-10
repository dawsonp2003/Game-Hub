import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  deleteAsyncMatch,
  listMyAsyncMatches,
  parseAsyncCodeFromUrl,
  pruneMyStaleMatches,
} from '../lib/async/matches'
import type { AsyncMatchSummary } from '../lib/async/types'
import AsyncCreateGameModal from './AsyncCreateGameModal'
import AsyncJoinGameModal from './AsyncJoinGameModal'
import AsyncMatchList from './AsyncMatchList'
import './AsyncMatchPanel.css'

const MAX_PER_GAME = 3

interface AsyncMatchPanelProps {
  gameId: string
  onNeedSignIn: () => void
}

export default function AsyncMatchPanel({ gameId, onNeedSignIn }: AsyncMatchPanelProps) {
  const auth = useAuth()
  const [matches, setMatches] = useState<AsyncMatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinInitialCode, setJoinInitialCode] = useState('')

  const refresh = useCallback(async () => {
    if (!auth.user) {
      setMatches([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      await pruneMyStaleMatches()
      const rows = await listMyAsyncMatches(gameId)
      setMatches(rows)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load games')
    } finally {
      setLoading(false)
    }
  }, [auth.user, gameId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const code = parseAsyncCodeFromUrl()
    if (!code || !auth.user) return
    setJoinInitialCode(code)
    setJoinOpen(true)
  }, [auth.user])

  const handleDelete = async (matchId: string) => {
    setBusy(true)
    setError(null)
    try {
      await deleteAsyncMatch(matchId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  if (!auth.enabled) {
    return <p className="async-panel__muted">Async games require Supabase to be configured.</p>
  }

  if (!auth.user) {
    return (
      <div className="async-panel">
        <p className="async-panel__muted">Sign in to play async saved games.</p>
        <button type="button" className="btn btn-secondary" onClick={onNeedSignIn}>
          Sign in
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="async-panel">
        {error && <p className="async-panel__error">{error}</p>}

        <div className="async-panel__actions-row">
          <button
            type="button"
            className="btn async-panel__action-btn"
            onClick={() => setCreateOpen(true)}
            disabled={matches.length >= MAX_PER_GAME}
          >
            New game
          </button>
          <button
            type="button"
            className="btn btn-secondary async-panel__action-btn"
            onClick={() => {
              setJoinInitialCode('')
              setJoinOpen(true)
            }}
          >
            Join game
          </button>
        </div>

        <AsyncMatchList
          matches={matches}
          gameId={gameId}
          loading={loading}
          emptyMessage="No games in progress. Start or join one above."
          onDelete={(id) => void handleDelete(id)}
          deleteBusy={busy}
        />
      </div>

      {createOpen && (
        <AsyncCreateGameModal
          gameId={gameId}
          activeCount={matches.length}
          onCreated={() => void refresh()}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {joinOpen && (
        <AsyncJoinGameModal
          gameId={gameId}
          initialCode={joinInitialCode}
          onClose={() => {
            setJoinOpen(false)
            setJoinInitialCode('')
          }}
        />
      )}
    </>
  )
}
