/** Render's blueprint `fromService.host` sometimes resolves to just the service name. */
function completeHostname(host: string): string {
  const clean = host.replace(/\/+$/, '')
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(clean)
  if (clean === 'localhost' || isIp || clean.includes('.')) return clean
  return `${clean}.onrender.com`
}

function normalizeSignalingUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    const url = new URL(trimmed)
    url.hostname = completeHostname(url.hostname)
    return url.toString().replace(/\/$/, '')
  }
  return `wss://${completeHostname(trimmed)}`
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
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.hostname}:3001`
  }

  // Prefer live hostname inference — always correct on Render, even if build-time env is wrong
  const inferred = inferSignalingUrlFromHost()
  if (inferred) return inferred

  const env = import.meta.env.VITE_SIGNALING_URL
  if (env) return normalizeSignalingUrl(env)

  throw new Error(
    'Multiplayer is not configured. Set VITE_SIGNALING_URL to your signaling server (e.g. game-arcade-signaling.onrender.com).',
  )
}

export function getSignalingHttpUrl(): string {
  return getSignalingUrl()
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
    .replace(/\/$/, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Ping the HTTP endpoint to wake a sleeping Render free-tier instance. */
export async function wakeSignalingServer(): Promise<void> {
  const base = getSignalingHttpUrl()
  try {
    await fetch(`${base}/health`, { cache: 'no-store' })
  } catch {
    try {
      await fetch(base, { mode: 'no-cors', cache: 'no-store' })
    } catch {
      /* Request may still reach the server and wake it */
    }
  }
}

export async function checkSignalingHealth(): Promise<{
  ok: boolean
  wsUrl: string
  httpUrl: string
  message: string
}> {
  const wsUrl = getSignalingUrl()
  const httpUrl = getSignalingHttpUrl()

  try {
    const res = await fetch(`${httpUrl}/health`, { cache: 'no-store' })
    if (res.ok) {
      return { ok: true, wsUrl, httpUrl, message: 'Signaling server is reachable' }
    }
    return { ok: false, wsUrl, httpUrl, message: `Server responded with ${res.status}` }
  } catch {
    return {
      ok: false,
      wsUrl,
      httpUrl,
      message:
        'Cannot reach signaling server. It may be waking up (~60s on free tier), blocked by VPN/firewall/ad-blocker, or your browser may be running a cached old version of the app.',
    }
  }
}

export type SignalingMessage =
  | { type: 'room-created'; code: string; role: string }
  | { type: 'room-joined'; code: string; role: string; rejoin?: boolean }
  | { type: 'peer-joined'; role: string }
  | { type: 'peer-rejoined'; role: string }
  | { type: 'peer-present'; role: string }
  | { type: 'peer-disconnected'; role: string; reconnectUntil: number }
  | { type: 'room-closed'; reason: string }
  | { type: 'left-room' }
  | { type: 'signal'; payload: unknown }
  | { type: 'error'; message: string }

export class SignalingClient {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<(data: unknown) => void>>()

  private connectOnce(url: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url)
      let settled = false

      const timer = window.setTimeout(() => {
        if (settled) return
        settled = true
        this.ws?.close()
        reject(new Error(`Connection timed out after ${timeoutMs / 1000}s`))
      }, timeoutMs)

      this.ws.onopen = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve()
      }

      this.ws.onerror = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        reject(new Error('WebSocket connection failed'))
      }

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

  async connect(): Promise<void> {
    let url: string
    try {
      url = getSignalingUrl()
    } catch (e) {
      throw e instanceof Error ? e : new Error('Signaling URL not configured')
    }

    const maxAttempts = 3

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await wakeSignalingServer()
      if (attempt > 1) await sleep(2500 * attempt)

      try {
        await this.connectOnce(url, 20_000)
        return
      } catch (e) {
        if (attempt === maxAttempts) {
          const detail = e instanceof Error ? e.message : 'Unknown error'
          throw new Error(
            `Could not connect to ${url} (${detail}). Try a hard refresh (Ctrl+Shift+R), disable ad blockers/VPN, or wait ~60s for the free server to wake up.`,
          )
        }
      }
    }
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
