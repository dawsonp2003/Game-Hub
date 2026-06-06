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
  signUp: (email: string, password: string, username: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updateUsername: (username: string) => Promise<void>
  refreshProfile: () => Promise<void>
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseEnabled)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
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

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      applySession(data.session)
      setLoading(false)
    })

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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim() } },
      })
      if (error) throw error
    },
    [],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Accounts are not available in this build.')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

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

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: isSupabaseEnabled,
      loading,
      user,
      profile,
      signUp,
      signIn,
      signOut,
      updateUsername,
      refreshProfile,
    }),
    [loading, user, profile, signUp, signIn, signOut, updateUsername, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
