import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useAsyncNotifications } from '../hooks/useAsyncNotifications'
import { useSocialNotifications } from '../hooks/useSocialNotifications'
import type { AsyncMatchSummary } from '../lib/async/types'

interface AsyncNotificationsValue {
  matches: AsyncMatchSummary[]
  loading: boolean
  turnByGame: Record<string, number>
  yourTurnCount: number
  pendingFriendRequests: number
  pendingAsyncInvites: number
  accountBadgeCount: number
  refresh: () => Promise<void>
  refreshSocial: () => Promise<void>
}

const AsyncNotificationsContext = createContext<AsyncNotificationsValue | null>(null)

export function AsyncNotificationsProvider({ children }: { children: ReactNode }) {
  const asyncNotifs = useAsyncNotifications()
  const socialNotifs = useSocialNotifications()

  const refresh = useCallback(async () => {
    await Promise.all([asyncNotifs.refresh(), socialNotifs.refresh()])
  }, [asyncNotifs.refresh, socialNotifs.refresh])

  const value = useMemo<AsyncNotificationsValue>(
    () => ({
      matches: asyncNotifs.matches,
      loading: asyncNotifs.loading,
      turnByGame: asyncNotifs.turnByGame,
      yourTurnCount: asyncNotifs.yourTurnCount,
      pendingFriendRequests: socialNotifs.pendingFriendRequests,
      pendingAsyncInvites: socialNotifs.pendingAsyncInvites,
      accountBadgeCount:
        asyncNotifs.yourTurnCount +
        socialNotifs.pendingFriendRequests +
        socialNotifs.pendingAsyncInvites,
      refresh,
      refreshSocial: socialNotifs.refresh,
    }),
    [
      asyncNotifs.matches,
      asyncNotifs.loading,
      asyncNotifs.turnByGame,
      asyncNotifs.yourTurnCount,
      socialNotifs.pendingFriendRequests,
      socialNotifs.pendingAsyncInvites,
      socialNotifs.refresh,
      refresh,
    ],
  )

  return (
    <AsyncNotificationsContext.Provider value={value}>{children}</AsyncNotificationsContext.Provider>
  )
}

export function useAsyncNotificationsContext(): AsyncNotificationsValue {
  const ctx = useContext(AsyncNotificationsContext)
  if (!ctx) {
    return {
      matches: [],
      loading: false,
      turnByGame: {},
      yourTurnCount: 0,
      pendingFriendRequests: 0,
      pendingAsyncInvites: 0,
      accountBadgeCount: 0,
      refresh: async () => {},
      refreshSocial: async () => {},
    }
  }
  return ctx
}
