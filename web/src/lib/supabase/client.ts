import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/**
 * A single shared client, or `null` when Supabase env vars are not configured.
 * Everything that touches accounts/cloud stats must handle the null case so the
 * app stays fully playable for guests and in local dev without a project.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

/** True when accounts/cloud sync are available in this build. */
export const isSupabaseEnabled = supabase !== null
