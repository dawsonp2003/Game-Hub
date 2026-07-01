import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ensureAnonymousSession } from '../lib/auth/session'
import {
  clearAsyncCodeFromUrl,
  joinAsyncMatchFromCode,
  parseAsyncCodeFromUrl,
} from '../lib/async/matches'
import { getGameById } from '../games/registry'

const PENDING_ASYNC_CODE_KEY = 'game-hub-pending-async-code'

export function stashPendingAsyncCode(code: string): void {
  sessionStorage.setItem(PENDING_ASYNC_CODE_KEY, code)
}

export function peekPendingAsyncCode(): string | null {
  const code = sessionStorage.getItem(PENDING_ASYNC_CODE_KEY)
  if (!code) return null
  const normalized = code.replace(/\D/g, '').slice(0, 6)
  return normalized.length === 6 ? normalized : null
}

export function takePendingAsyncCode(): string | null {
  const code = peekPendingAsyncCode()
  if (code) sessionStorage.removeItem(PENDING_ASYNC_CODE_KEY)
  return code
}

function clearPendingAsyncCode(): void {
  sessionStorage.removeItem(PENDING_ASYNC_CODE_KEY)
}

/** Auto-join when the app opens with ?async=CODE in the URL. */
export default function AsyncLinkJoiner() {
  const auth = useAuth()
  const navigate = useNavigate()
  const joiningRef = useRef(false)

  // Drop stale invite codes left in sessionStorage when there is no active link.
  useEffect(() => {
    if (!parseAsyncCodeFromUrl()) {
      clearPendingAsyncCode()
    }
  }, [])

  useEffect(() => {
    const code = parseAsyncCodeFromUrl()
    if (!code) return
    if (auth.loading) return

    if (!auth.user) {
      stashPendingAsyncCode(code)
      if (!auth.sessionFailed) {
        void ensureAnonymousSession()
      }
      return
    }

    if (joiningRef.current) return
    joiningRef.current = true

    void joinAsyncMatchFromCode(code)
      .then(({ matchId, gameId }) => {
        clearAsyncCodeFromUrl()
        clearPendingAsyncCode()
        const game = getGameById(gameId)
        if (!game?.modes.includes('async')) {
          return
        }
        navigate(`/play/${gameId}`, { state: { mode: 'async', matchId }, replace: true })
      })
      .catch((err) => {
        console.warn('[async-link] join failed', err)
        clearAsyncCodeFromUrl()
        clearPendingAsyncCode()
      })
      .finally(() => {
        joiningRef.current = false
      })
  }, [auth.user, auth.loading, auth.sessionFailed, navigate])

  return null
}
