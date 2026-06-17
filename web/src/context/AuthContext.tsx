import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isAnonymousUser, isPermanentAccount } from '../lib/auth/anonymous'
import { getDeviceId } from '../lib/auth/device-id'
import { supabase, isSupabaseEnabled } from '../lib/supabase/client'

export interface Profile {
  id: string
  username: string
  totalGamesPlayed: number
  createdAt: string
}

export interface AuthContextValue {
  /** Whether this build has Supabase configured at all. */
  enabled: boolean
  loading: boolean
  user: User | null
  profile: Profile | null
  /** True when signed in via Supabase anonymous auth (device session). */
  isAnonymous: boolean
  /** True when the user has a permanent email/password account. */
  isPermanent: boolean
  signUp: (email: string, password: string, username: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updateUsername: (username: string) => Promise<void>
  refreshProfile: () => Promise<void>
  openAccountCreation: () => void
  accountCreationRequested: boolean
  clearAccountCreationRequest: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapProfile(row: {
  id: string
  username: string
  total_games_played: number
  created_at: string
}): Profile {
  return {
    id: row.id,
    username: row.username,
    totalGamesPlayed: row.total_games_played,
    createdAt: row.created_at,
  }
}

async function ensureAnonymousSession(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (data.session) return

  const deviceId = getDeviceId()
  const suffix = deviceId.slice(0, 4)
  const { error } = await supabase.auth.signInAnonymously({
    options: {
      data: { username: `Guest-${suffix}`, device_id: deviceId },
    },
  })
  if (error) {
    console.warn('[auth] anonymous sign-in failed', error.message)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseEnabled)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accountCreationRequested, setAccountCreationRequested] = useState(false)
  const userIdRef = useRef<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, total_games_played, created_at')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.warn('[auth] profile load failed', error.message)
      return
    }
    if (data) setProfile(mapProfile(data))
  }, [])

  const refreshProfile = useCallback(async () => {
    if (userIdRef.current) await loadProfile(userIdRef.current)
  }, [loadProfile])

  useEffect(() => {
    if (!supabase) return

    let active = true

    void (async () => {
      await ensureAnonymousSession()
      if (!active) return
      const { data } = await supabase.auth.getSession()
      if (!active) return
      applySession(data.session)
      setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })

    function applySession(session: Session | null) {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      userIdRef.current = nextUser?.id ?? null
      if (nextUser) {
        void loadProfile(nextUser.id)
      } else {
        setProfile(null)
      }
    }

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signUp = useCallback(
    async (email: string, password: string, username: string) => {
      if (!supabase) throw new Error('Accounts are not available in this build.')

      const { data: sessionData } = await supabase.auth.getSession()
      const currentUser = sessionData.session?.user

      if (currentUser && isAnonymousUser(currentUser)) {
        const { error: updateError } = await supabase.auth.updateUser({
          email,
          password,
          data: { username: username.trim() },
        })
        if (updateError) throw updateError

        if (userIdRef.current) {
          const trimmed = username.trim()
          if (trimmed) {
            await supabase.from('profiles').update({ username: trimmed }).eq('id', userIdRef.current)
          }
        }
        await refreshProfile()
        return
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim() } },
      })
      if (error) throw error
    },
    [refreshProfile],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Accounts are not available in this build.')
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session && isAnonymousUser(sessionData.session.user)) {
      await supabase.auth.signOut()
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setProfile(null)
    await ensureAnonymousSession()
    const { data } = await supabase.auth.getSession()
    setUser(data.session?.user ?? null)
    userIdRef.current = data.session?.user?.id ?? null
    if (data.session?.user) {
      void loadProfile(data.session.user.id)
    }
  }, [loadProfile])

  const updateUsername = useCallback(
    async (username: string) => {
      if (!supabase || !userIdRef.current) throw new Error('Not signed in.')
      const trimmed = username.trim()
      if (!trimmed) throw new Error('Username cannot be empty.')
      const { error } = await supabase
        .from('profiles')
        .update({ username: trimmed })
        .eq('id', userIdRef.current)
      if (error) throw error
      await refreshProfile()
    },
    [refreshProfile],
  )

  const openAccountCreation = useCallback(() => {
    setAccountCreationRequested(true)
  }, [])

  const clearAccountCreationRequest = useCallback(() => {
    setAccountCreationRequested(false)
  }, [])

  const isAnonymous = isAnonymousUser(user)
  const isPermanent = isPermanentAccount(user)

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: isSupabaseEnabled,
      loading,
      user,
      profile,
      isAnonymous,
      isPermanent,
      signUp,
      signIn,
      signOut,
      updateUsername,
      refreshProfile,
      openAccountCreation,
      accountCreationRequested,
      clearAccountCreationRequest,
    }),
    [
      loading,
      user,
      profile,
      isAnonymous,
      isPermanent,
      signUp,
      signIn,
      signOut,
      updateUsername,
      refreshProfile,
      openAccountCreation,
      accountCreationRequested,
      clearAccountCreationRequest,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
