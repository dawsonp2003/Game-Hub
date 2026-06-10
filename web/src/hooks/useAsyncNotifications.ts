import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { listAllMyAsyncMatches } from '../lib/async/matches'
import { subscribeAsyncNotifications } from '../lib/async/notifications-bus'
import type { AsyncMatchSummary } from '../lib/async/types'
import { supabase } from '../lib/supabase/client'

function summarizeTurns(matches: AsyncMatchSummary[]): {
  turnByGame: Record<string, number>
  yourTurnCount: number
} {
  const turnByGame: Record<string, number> = {}
  let yourTurnCount = 0
  for (const m of matches) {
    if (m.isMyTurn) {
      yourTurnCount += 1
      turnByGame[m.gameId] = (turnByGame[m.gameId] ?? 0) + 1
    }
  }
  return { turnByGame, yourTurnCount }
}

export function useAsyncNotifications(pollMs = 120_000) {
  const auth = useAuth()
  const [matches, setMatches] = useState<AsyncMatchSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [turnByGame, setTurnByGame] = useState<Record<string, number>>({})
  const [yourTurnCount, setYourTurnCount] = useState(0)
  const refreshInFlight = useRef(false)

  const applyMatches = useCallback((rows: AsyncMatchSummary[]) => {
    setMatches(rows)
    const { turnByGame: byGame, yourTurnCount: turns } = summarizeTurns(rows)
    setTurnByGame(byGame)
    setYourTurnCount(turns)
  }, [])

  const clearTurnForMatch = useCallback((matchId: string) => {
    setMatches((prev) => {
      const next = prev.map((m) =>
        m.id === matchId ? { ...m, isMyTurn: false, whoseTurn: null } : m,
      )
      const { turnByGame: byGame, yourTurnCount: turns } = summarizeTurns(next)
      setTurnByGame(byGame)
      setYourTurnCount(turns)
      return next
    })
  }, [])

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!auth.user) {
        applyMatches([])
        setLoading(false)
        return
      }
      if (refreshInFlight.current) return
      refreshInFlight.current = true
      if (!opts?.silent) setLoading(true)
      try {
        const rows = await listAllMyAsyncMatches()
        applyMatches(rows)
      } catch {
        // keep last known state on transient errors
      } finally {
        refreshInFlight.current = false
        if (!opts?.silent) setLoading(false)
      }
    },
    [auth.user, applyMatches],
  )

  useEffect(() => {
    void refresh()
    if (!auth.user) return

    const unsubBus = subscribeAsyncNotifications((event) => {
      if (event.type === 'cleared-turn') {
        clearTurnForMatch(event.matchId)
      }
      void refresh({ silent: true })
    })

    const uid = auth.user.id
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    if (supabase) {
      channel = supabase
        .channel(`async-notifications-${uid}-${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'async_matches',
            filter: `player1_id=eq.${uid}`,
          },
          () => void refresh({ silent: true }),
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'async_matches',
            filter: `player2_id=eq.${uid}`,
          },
          () => void refresh({ silent: true }),
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'async_matches',
            filter: `player1_id=eq.${uid}`,
          },
          () => void refresh({ silent: true }),
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'async_matches',
            filter: `player2_id=eq.${uid}`,
          },
          () => void refresh({ silent: true }),
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'async_matches',
            filter: `player1_id=eq.${uid}`,
          },
          () => void refresh({ silent: true }),
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'async_matches',
            filter: `player2_id=eq.${uid}`,
          },
          () => void refresh({ silent: true }),
        )
        .subscribe()
    }

    const id = window.setInterval(() => void refresh({ silent: true }), pollMs)
    return () => {
      unsubBus()
      window.clearInterval(id)
      if (channel && supabase) void supabase.removeChannel(channel)
    }
  }, [auth.user, pollMs, refresh, clearTurnForMatch])

  return { matches, loading, turnByGame, yourTurnCount, refresh }
}
