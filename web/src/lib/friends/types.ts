export interface Friend {
  userId: string
  username: string
  friendsSince: string
}

export interface FriendRequest {
  requesterId: string
  username: string
  requestedAt: string
}

export interface UserSearchResult {
  id: string
  username: string
}

export interface FriendH2HGame {
  gameId: string
  myWins: number
  myLosses: number
  myDraws: number
  totalGames: number
}

export interface AsyncMatchInvite {
  inviteId: string
  matchId: string
  gameId: string
  joinCode: string | null
  fromUserId: string
  fromUsername: string
  createdAt: string
}
