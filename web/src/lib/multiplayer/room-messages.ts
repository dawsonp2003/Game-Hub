/** Room-level messages sent over the WebRTC data channel (prefix `room:`). */
export type RoomChannelMessage =
  | { type: 'room:launch'; gameId: string; gameName: string }
  | { type: 'room:suggest'; gameId: string; gameName: string }
  | { type: 'room:dismiss-suggestion' }

export function isRoomChannelMessage(msg: unknown): msg is RoomChannelMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as { type: string }).type === 'string' &&
    (msg as { type: string }).type.startsWith('room:')
  )
}

export interface GameSuggestion {
  gameId: string
  gameName: string
}

export interface GameLaunch {
  gameId: string
  gameName: string
}
