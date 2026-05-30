function normalizeSignalingUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed
  return `wss://${trimmed}`
}

/** Derive signaling host from Render static site naming (…-web → …-signaling). */
function inferSignalingUrlFromHost(): string | null {
  const { hostname } = window.location
  if (!hostname.endsWith('.onrender.com')) return null

  if (hostname.includes('-web')) {
    return `wss://${hostname.replace('-web', '-signaling')}`
  }

  return null
}

export function getSignalingUrl(): string {
  const env = import.meta.env.VITE_SIGNALING_URL
  if (env) return normalizeSignalingUrl(env)

  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.hostname}:3001`
  }

  const inferred = inferSignalingUrlFromHost()
  if (inferred) return inferred

  throw new Error(
    'Multiplayer is not configured. Set VITE_SIGNALING_URL to your signaling server (e.g. wss://game-arcade-signaling.onrender.com).',
  )
}

export type SignalingMessage =
  | { type: 'room-created'; code: string }
  | { type: 'room-joined' }
  | { type: 'peer-joined' }
  | { type: 'signal'; payload: unknown }
  | { type: 'error'; message: string }
  | { type: 'peer-left' }

export class SignalingClient {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<(data: unknown) => void>>()

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let url: string
      try {
        url = getSignalingUrl()
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Signaling URL not configured'))
        return
      }

      this.ws = new WebSocket(url)

      this.ws.onopen = () => resolve()
      this.ws.onerror = () =>
        reject(
          new Error(
            `Could not connect to signaling server (${url}). If this is your first visit in a while, wait ~60s for the free server to wake up and try again.`,
          ),
        )
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as SignalingMessage
          this.emit(msg.type, msg)
        } catch {
          /* ignore malformed */
        }
      }
      this.ws.onclose = () => this.emit('close', {})
    })
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
    return () => this.listeners.get(event)?.delete(handler)
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((h) => h(data))
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.listeners.clear()
  }
}
