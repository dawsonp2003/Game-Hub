export type SessionRole = 'host' | 'guest' | 'local'

export interface MultiplayerSession {
  role: SessionRole
  isConnected: boolean
  send(message: unknown): void
  onMessage(handler: (message: unknown) => void): () => void
  disconnect(): void
}

export function createLocalSession(): MultiplayerSession {
  const handlers = new Set<(message: unknown) => void>()

  return {
    role: 'local',
    isConnected: true,
    send(message) {
      handlers.forEach((h) => h(message))
    },
    onMessage(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    disconnect() {
      handlers.clear()
    },
  }
}
