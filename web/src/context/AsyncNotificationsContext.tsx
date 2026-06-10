import { createContext, useContext, type ReactNode } from 'react'
import { useAsyncNotifications } from '../hooks/useAsyncNotifications'
import type { AsyncMatchSummary } from '../lib/async/types'

interface AsyncNotificationsValue {
  matches: AsyncMatchSummary[]
  loading: boolean
  turnByGame: Record<string, number>
  yourTurnCount: number
  refresh: () => Promise<void>
}

const AsyncNotificationsContext = createContext<AsyncNotificationsValue | null>(null)

export function AsyncNotificationsProvider({ children }: { children: ReactNode }) {
  const value = useAsyncNotifications()
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
      refresh: async () => {},
    }
  }
  return ctx
}
