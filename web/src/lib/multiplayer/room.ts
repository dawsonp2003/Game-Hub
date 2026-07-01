import type { ConnectionState, MultiplayerSession, SessionRole } from './session'
import { isAnonymousUser } from '../auth/anonymous'
import { SignalingClient } from './signaling'
import { supabase } from '../supabase/client'

const STORAGE_KEY = 'game-arcade-client-id'
const ROOM_STORAGE_KEY = 'game-arcade-room'
const MAX_RELAY_BYTES = 8192

export function getClientId(): string {
  // sessionStorage = one ID per tab (localStorage breaks two-tab testing on the same browser)
  let id = sessionStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

/** Permanent accounts only — anonymous guests use clientId for rooms. */
export async function getAccountId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user ?? null
  if (!user || isAnonymousUser(user)) return null
  return user.id
}

export function saveRoomPrefs(code: string, role: SessionRole): void {
  sessionStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify({ code, role }))
}

export function loadRoomPrefs(): { code: string; role: SessionRole } | null {
  try {
    const raw = sessionStorage.getItem(ROOM_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as { code: string; role: SessionRole }
  } catch {
    return null
  }
}

export function clearRoomPrefs(): void {
  sessionStorage.removeItem(ROOM_STORAGE_KEY)
}

export type RoomEvent =
  | { type: 'state'; state: ConnectionState; message: string }
  | { type: 'room-code'; code: string; role: SessionRole }
  | { type: 'peer-away'; until: number }
  | { type: 'peer-back' }
  | { type: 'room-closed'; reason: string }
  | { type: 'error'; message: string }

export class RoomConnection {
  private signaling = new SignalingClient()
  private handlers = new Set<(message: unknown) => void>()
  private connectionHandlers = new Set<(state: ConnectionState) => void>()
  private eventHandlers = new Set<(event: RoomEvent) => void>()
  private role: SessionRole = 'host'
  private signalingWired = false
  private inSignalingRoom = false
  private peerPresent = false

  readonly session: MultiplayerSession

  constructor() {
    this.session = {
      role: 'host',
      connectionState: 'disconnected',
      isConnected: false,
      send: (msg) => this.send(msg),
      onMessage: (h) => this.onMessage(h),
      onConnectionChange: (h) => this.onConnectionChange(h),
      disconnect: () => this.teardown(),
    }
  }

  onEvent(handler: (event: RoomEvent) => void): () => void {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  private emit(event: RoomEvent): void {
    this.eventHandlers.forEach((h) => h(event))
  }

  private setState(state: ConnectionState, message: string): void {
    this.session.connectionState = state
    this.session.isConnected = state === 'connected'
    this.connectionHandlers.forEach((h) => h(state))
    this.emit({ type: 'state', state, message })
  }

  private onMessage(handler: (message: unknown) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private onConnectionChange(handler: (state: ConnectionState) => void): () => void {
    this.connectionHandlers.add(handler)
    return () => this.connectionHandlers.delete(handler)
  }

  private send(message: unknown): void {
    if (!this.inSignalingRoom || !this.peerPresent) return
    let serialized: string
    try {
      serialized = JSON.stringify(message)
    } catch {
      return
    }
    if (serialized.length > MAX_RELAY_BYTES) {
      this.emit({ type: 'error', message: 'Message too large to send' })
      return
    }
    this.signaling.send({ type: 'relay', clientId: getClientId(), payload: message })
  }

  private markPlayReady(message = 'Connected — pick a game to play together!'): void {
    this.peerPresent = true
    this.setState('connected', message)
  }

  private markPeerAway(until: number, message: string): void {
    this.peerPresent = false
    this.setState('peer-away', message)
    this.emit({ type: 'peer-away', until })
  }

  private dispatchPayload(payload: unknown): void {
    if (payload === undefined) return
    this.handlers.forEach((h) => h(payload))
  }

  private wireSignaling(): void {
    if (this.signalingWired) return
    this.signalingWired = true

    this.signaling.on('relay', (data) => {
      const msg = data as { payload?: unknown }
      this.dispatchPayload(msg.payload)
    })

    this.signaling.on('peer-joined', () => {
      this.markPlayReady('Friend joined — pick a game to play together!')
    })

    this.signaling.on('peer-rejoined', () => {
      this.markPlayReady('Friend reconnected — pick a game to play together!')
      this.emit({ type: 'peer-back' })
    })

    this.signaling.on('peer-present', () => {
      this.markPlayReady('Friend is in the room — pick a game to play together!')
    })

    this.signaling.on('peer-disconnected', (data) => {
      const msg = data as { role: string; reconnectUntil: number }
      this.markPeerAway(
        msg.reconnectUntil,
        `Friend stepped away — can rejoin for ${Math.round((msg.reconnectUntil - Date.now()) / 1000)}s`,
      )
    })

    this.signaling.on('room-closed', (data) => {
      const msg = data as { reason: string }
      this.emit({ type: 'room-closed', reason: msg.reason })
      this.teardown()
    })

    this.signaling.on('left-room', () => {
      this.teardown()
    })

    this.signaling.on('error', (data) => {
      const msg = data as { message?: string }
      this.emit({ type: 'error', message: msg.message ?? 'Room error' })
    })

    this.signaling.on('close', () => {
      if (this.inSignalingRoom) {
        this.emit({ type: 'error', message: 'Lost connection to the room server — try rejoining' })
      }
    })
  }

  private waitForSignalingEvent(
    event: string,
    onSuccess: (data: unknown) => void,
    timeoutMs = 30_000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup()
        reject(new Error('Connection timed out — check that the signaling server is running'))
      }, timeoutMs)

      const unsubSuccess = this.signaling.on(event, (data) => {
        cleanup()
        try {
          onSuccess(data)
          resolve()
        } catch (e) {
          reject(e instanceof Error ? e : new Error('Room error'))
        }
      })

      const unsubError = this.signaling.on('error', (data) => {
        const msg = data as { message?: string }
        cleanup()
        reject(new Error(msg.message ?? 'Room error'))
      })

      const cleanup = () => {
        window.clearTimeout(timeout)
        unsubSuccess()
        unsubError()
      }
    })
  }

  async createRoom(): Promise<void> {
    await this.connectSignaling()
    this.role = 'host'
    this.session.role = 'host'
    this.wireSignaling()

    this.setState('signaling', 'Creating room…')

    const pending = this.waitForSignalingEvent('room-created', (data) => {
      const { code } = data as { code: string; role: SessionRole }
      this.inSignalingRoom = true
      this.peerPresent = false
      saveRoomPrefs(code, 'host')
      this.setState('waiting', 'Waiting for a friend…')
      this.emit({ type: 'room-code', code, role: 'host' })
    })

    const accountId = await getAccountId()
    this.signaling.send({ type: 'create-room', clientId: getClientId(), accountId })
    await pending
  }

  async joinRoom(code: string): Promise<void> {
    const normalized = code.replace(/\D/g, '').slice(0, 6)
    if (normalized.length !== 6) throw new Error('Enter a 6-digit room code')

    await this.connectSignaling()
    this.wireSignaling()

    this.setState('signaling', 'Joining room…')

    const pending = this.waitForSignalingEvent('room-joined', (data) => {
      const msg = data as { code: string; role: SessionRole; rejoin?: boolean }
      this.role = msg.role
      this.session.role = msg.role
      this.inSignalingRoom = true

      if (msg.role === 'host') {
        this.peerPresent = false
        saveRoomPrefs(msg.code, msg.role)
        this.setState('waiting', `Rejoined room ${msg.code}`)
      } else {
        saveRoomPrefs(msg.code, msg.role)
        this.markPlayReady('In room — connected to host')
      }
      this.emit({ type: 'room-code', code: msg.code, role: msg.role })
    })

    const accountId = await getAccountId()
    this.signaling.send({ type: 'join-room', code: normalized, clientId: getClientId(), accountId })
    await pending
  }

  async tryRestoreRoom(): Promise<boolean> {
    const prefs = loadRoomPrefs()
    if (!prefs) return false

    try {
      await this.joinRoom(prefs.code)
      return true
    } catch {
      clearRoomPrefs()
      return false
    }
  }

  leaveRoom(): void {
    this.release()
  }

  /** Notify the server before tearing down (e.g. when swapping connections). */
  release(): void {
    if (this.inSignalingRoom) {
      this.signaling.send({ type: 'leave-room', clientId: getClientId() })
      this.inSignalingRoom = false
    }
    this.teardown()
  }

  closeRoom(): void {
    if (this.role === 'host') {
      this.signaling.send({ type: 'close-room', clientId: getClientId() })
    }
    this.teardown()
  }

  private async connectSignaling(): Promise<void> {
    this.setState('signaling', 'Connecting to server…')
    await this.signaling.connect()
  }

  /** Tear down network state but keep event listeners (for reconnecting same instance). */
  teardown(): void {
    this.inSignalingRoom = false
    this.peerPresent = false
    this.signaling.disconnect()
    this.signaling = new SignalingClient()
    this.signalingWired = false
    this.handlers.clear()
    this.connectionHandlers.clear()
    clearRoomPrefs()
    this.session.role = 'host'
    this.role = 'host'
    if (this.eventHandlers.size > 0) {
      this.setState('disconnected', '')
    }
  }

  destroy(): void {
    this.teardown()
    this.eventHandlers.clear()
  }
}
