export type SessionRole = 'host' | 'guest' | 'local'

export type ConnectionState = 'disconnected' | 'signaling' | 'waiting' | 'connected' | 'peer-away'

export interface MultiplayerSession {
  role: SessionRole
  connectionState: ConnectionState
  isConnected: boolean
  send(message: unknown): void
  onMessage(handler: (message: unknown) => void): () => void
  onConnectionChange(handler: (state: ConnectionState) => void): () => void
  disconnect(): void
}

export function createLocalSession(): MultiplayerSession {
  const handlers = new Set<(message: unknown) => void>()
  const connectionHandlers = new Set<(state: ConnectionState) => void>()

  return {
    role: 'local',
    connectionState: 'connected',
    isConnected: true,
    send(message) {
      handlers.forEach((h) => h(message))
    },
    onMessage(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    onConnectionChange(handler) {
      connectionHandlers.add(handler)
      return () => connectionHandlers.delete(handler)
    },
    disconnect() {
      handlers.clear()
      connectionHandlers.clear()
    },
  }
}
