import { supabase } from '../supabase/client'
import { emitSocialNotificationsRefresh } from './notifications-bus'
import type { AsyncMatchInvite } from './types'

async function requireUserId(): Promise<string> {
  if (!supabase) throw new Error('Accounts are not configured.')
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Sign in required.')
  return data.session.user.id
}

export async function inviteFriendToAsyncMatch(
  matchId: string,
  friendId: string,
): Promise<string> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('invite_friend_to_async_match', {
    p_match_id: matchId,
    p_friend_id: friendId,
  })
  if (error) throw error
  emitSocialNotificationsRefresh()
  return data as string
}

export async function listMyAsyncInvites(): Promise<AsyncMatchInvite[]> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('list_my_async_invites')
  if (error) throw error
  return ((data ?? []) as {
    invite_id: string
    match_id: string
    game_id: string
    join_code: string | null
    from_user_id: string
    from_username: string
    created_at: string
  }[]).map((r) => ({
    inviteId: r.invite_id,
    matchId: r.match_id,
    gameId: r.game_id,
    joinCode: r.join_code,
    fromUserId: r.from_user_id,
    fromUsername: r.from_username,
    createdAt: r.created_at,
  }))
}

export async function dismissAsyncInvite(inviteId: string): Promise<void> {
  await requireUserId()
  const { error } = await supabase!.rpc('dismiss_async_invite', { p_invite_id: inviteId })
  if (error) throw error
  emitSocialNotificationsRefresh()
}

export async function acceptAsyncInvite(inviteId: string): Promise<string> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('accept_async_invite', { p_invite_id: inviteId })
  if (error) throw error
  emitSocialNotificationsRefresh()
  return data as string
}

export async function countPendingAsyncInvites(): Promise<number> {
  if (!supabase) return 0
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return 0
  const { data, error } = await supabase.rpc('count_pending_async_invites')
  if (error) return 0
  return (data as number) ?? 0
}
