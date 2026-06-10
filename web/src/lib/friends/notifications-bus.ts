export type SocialNotificationsEvent = { type: 'refresh' }

type Listener = (event: SocialNotificationsEvent) => void

const listeners = new Set<Listener>()

export function subscribeSocialNotifications(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitSocialNotificationsRefresh(): void {
  for (const listener of listeners) {
    listener({ type: 'refresh' })
  }
}
