import { getDeviceId } from './device-id'

/** Stable id for local stats/checkpoints — Supabase user id when signed in, else device id. */
export function getLocalPlayerId(userId: string | undefined | null): string {
  return userId ?? getDeviceId()
}
