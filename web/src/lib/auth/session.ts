import { getDeviceId } from './device-id'
import { supabase } from '../supabase/client'
import type { Session } from '@supabase/supabase-js'

/** Create or restore a Supabase session (anonymous guest when none exists). */
export async function ensureAnonymousSession(): Promise<Session | null> {
  if (!supabase) return null

  const { data: existing } = await supabase.auth.getSession()
  if (existing.session) return existing.session

  const deviceId = getDeviceId()
  const suffix = deviceId.slice(0, 4)
  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: { username: `Guest-${suffix}`, device_id: deviceId },
    },
  })

  if (error) {
    console.warn('[auth] anonymous sign-in failed', error.message)
    return null
  }

  if (data.session) return data.session

  const { data: after } = await supabase.auth.getSession()
  return after.session ?? null
}
