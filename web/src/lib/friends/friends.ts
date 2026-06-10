import { supabase } from '../supabase/client'
import { emitSocialNotificationsRefresh } from './notifications-bus'
import type { Friend, FriendH2HGame, FriendRequest, UserSearchResult } from './types'

async function requireUserId(): Promise<string> {
  if (!supabase) throw new Error('Accounts are not configured.')
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Sign in required.')
  return data.session.user.id
}

export async function searchUsersByUsername(query: string): Promise<UserSearchResult[]> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('search_users_by_username', {
    p_query: query.trim(),
  })
  if (error) throw error
  return ((data ?? []) as { id: string; username: string }[]).map((r) => ({
    id: r.id,
    username: r.username,
  }))
}

export async function sendFriendRequest(userId: string): Promise<void> {
  await requireUserId()
  const { error } = await supabase!.rpc('send_friend_request', { p_user_id: userId })
  if (error) throw error
  emitSocialNotificationsRefresh()
}

export async function acceptFriendRequest(requesterId: string): Promise<void> {
  await requireUserId()
  const { error } = await supabase!.rpc('accept_friend_request', { p_requester_id: requesterId })
  if (error) throw error
  emitSocialNotificationsRefresh()
}

export async function declineFriendRequest(requesterId: string): Promise<void> {
  await requireUserId()
  const { error } = await supabase!.rpc('decline_friend_request', { p_requester_id: requesterId })
  if (error) throw error
  emitSocialNotificationsRefresh()
}

export async function removeFriend(userId: string): Promise<void> {
  await requireUserId()
  const { error } = await supabase!.rpc('remove_friend', { p_user_id: userId })
  if (error) throw error
  emitSocialNotificationsRefresh()
}

export async function blockUser(userId: string): Promise<void> {
  await requireUserId()
  const { error } = await supabase!.rpc('block_user', { p_user_id: userId })
  if (error) throw error
  emitSocialNotificationsRefresh()
}

export async function listFriends(): Promise<Friend[]> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('list_friends')
  if (error) throw error
  return ((data ?? []) as { user_id: string; username: string; friends_since: string }[]).map(
    (r) => ({
      userId: r.user_id,
      username: r.username,
      friendsSince: r.friends_since,
    }),
  )
}

export async function listFriendRequests(): Promise<FriendRequest[]> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('list_friend_requests')
  if (error) throw error
  return ((data ?? []) as { requester_id: string; username: string; requested_at: string }[]).map(
    (r) => ({
      requesterId: r.requester_id,
      username: r.username,
      requestedAt: r.requested_at,
    }),
  )
}

export async function countPendingFriendRequests(): Promise<number> {
  if (!supabase) return 0
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return 0
  const { data, error } = await supabase.rpc('count_pending_friend_requests')
  if (error) return 0
  return (data as number) ?? 0
}

export async function getFriendH2H(
  friendId: string,
  gameId?: string,
): Promise<FriendH2HGame[]> {
  await requireUserId()
  const { data, error } = await supabase!.rpc('get_friend_h2h', {
    p_friend_id: friendId,
    p_game_id: gameId ?? null,
  })
  if (error) throw error
  return ((data ?? []) as {
    game_id: string
    my_wins: number
    my_losses: number
    my_draws: number
    total_games: number
  }[]).map((r) => ({
    gameId: r.game_id,
    myWins: r.my_wins,
    myLosses: r.my_losses,
    myDraws: r.my_draws,
    totalGames: r.total_games,
  }))
}
