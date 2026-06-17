import type { User } from '@supabase/supabase-js'

export function isAnonymousUser(user: User | null | undefined): boolean {
  if (!user) return false
  return user.is_anonymous === true
}

export function isPermanentAccount(user: User | null | undefined): boolean {
  return !!user && !isAnonymousUser(user)
}
