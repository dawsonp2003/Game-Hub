import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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

export function takePendingAsyncCode(): string | null {
  const code = sessionStorage.getItem(PENDING_ASYNC_CODE_KEY)
  if (code) sessionStorage.removeItem(PENDING_ASYNC_CODE_KEY)
  return code
}

/** Auto-join when the app opens with ?async=CODE in the URL. */
export default function AsyncLinkJoiner() {
  const auth = useAuth()
  const navigate = useNavigate()
  const joiningRef = useRef(false)

  useEffect(() => {
    const code = parseAsyncCodeFromUrl() ?? takePendingAsyncCode()
    if (!code) return

    if (!auth.user) {
      stashPendingAsyncCode(code)
      clearAsyncCodeFromUrl()
      navigate('/', { state: { openAccount: true }, replace: true })
      return
    }

    if (joiningRef.current) return
    joiningRef.current = true
    clearAsyncCodeFromUrl()

    void joinAsyncMatchFromCode(code)
      .then(({ matchId, gameId }) => {
        const game = getGameById(gameId)
        if (!game?.modes.includes('async')) {
          navigate('/', { replace: true })
          return
        }
        navigate(`/play/${gameId}`, { state: { mode: 'async', matchId }, replace: true })
      })
      .catch(() => {
        navigate('/', { replace: true })
      })
      .finally(() => {
        joiningRef.current = false
      })
  }, [auth.user, navigate])

  return null
}
