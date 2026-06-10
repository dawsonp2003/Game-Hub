import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { countPendingFriendRequests } from '../lib/friends/friends'
import { countPendingAsyncInvites } from '../lib/friends/invites'
import { subscribeSocialNotifications } from '../lib/friends/notifications-bus'
import { supabase } from '../lib/supabase/client'

export function useSocialNotifications(pollMs = 120_000) {
  const auth = useAuth()
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0)
  const [pendingAsyncInvites, setPendingAsyncInvites] = useState(0)
  const refreshInFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!auth.user) {
      setPendingFriendRequests(0)
      setPendingAsyncInvites(0)
      return
    }
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    try {
      const [friends, invites] = await Promise.all([
        countPendingFriendRequests(),
        countPendingAsyncInvites(),
      ])
      setPendingFriendRequests(friends)
      setPendingAsyncInvites(invites)
    } catch {
      // keep last known counts
    } finally {
      refreshInFlight.current = false
    }
  }, [auth.user])

  useEffect(() => {
    void refresh()
    if (!auth.user) return

    const unsubBus = subscribeSocialNotifications(() => {
      void refresh()
    })

    const uid = auth.user.id
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    if (supabase) {
      channel = supabase
        .channel(`social-notifications-${uid}-${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friendships',
            filter: `addressee_id=eq.${uid}`,
          },
          () => void refresh(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friendships',
            filter: `requester_id=eq.${uid}`,
          },
          () => void refresh(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'async_match_invites',
            filter: `to_user_id=eq.${uid}`,
          },
          () => void refresh(),
        )
        .subscribe()
    }

    const id = window.setInterval(() => void refresh(), pollMs)
    return () => {
      unsubBus()
      window.clearInterval(id)
      if (channel && supabase) void supabase.removeChannel(channel)
    }
  }, [auth.user, pollMs, refresh])

  const socialBadgeCount = pendingFriendRequests + pendingAsyncInvites

  return { pendingFriendRequests, pendingAsyncInvites, socialBadgeCount, refresh }
}
