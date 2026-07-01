import type { ConnectionState, MultiplayerSession, SessionRole } from './session'
import { isAnonymousUser } from '../auth/anonymous'
import { SignalingClient } from './signaling'
import { supabase } from '../supabase/client'

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]

  const turnUrl = import.meta.env.VITE_TURN_URL?.trim()
  const turnUser = import.meta.env.VITE_TURN_USERNAME?.trim()
  const turnCred = import.meta.env.VITE_TURN_CREDENTIAL?.trim()
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred })
  }

  // Public relay fallback — helps when both peers are behind strict NAT / mobile networks.
  servers.push(
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  )

  return servers
}

const ICE_SERVERS = buildIceServers()

const STORAGE_KEY = 'game-arcade-client-id'
const ROOM_STORAGE_KEY = 'game-arcade-room'

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
  private pc: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private role: SessionRole = 'host'
  private connectionState: ConnectionState = 'disconnected'
  private makingOffer = false
  private signalingWired = false
  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private pendingSignals: Array<{ sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }> =
    []
  private inSignalingRoom = false
  private webrtcStarting = false

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
    this.connectionState = state
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
    if (this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify(message))
    }
  }

  private closeWebRTC(): void {
    this.channel?.close()
    this.pc?.close()
    this.channel = null
    this.pc = null
    this.pendingCandidates = []
  }

  private async applySignalPayload(payload: {
    sdp?: RTCSessionDescriptionInit
    candidate?: RTCIceCandidateInit
  }): Promise<void> {
    if (!this.pc) return

    if (payload.sdp) {
      await this.pc.setRemoteDescription(payload.sdp)
      await this.flushPendingCandidates()
      if (payload.sdp.type === 'offer' && this.role === 'guest') {
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)
        this.signaling.send({
          type: 'signal',
          payload: { sdp: { type: answer.type, sdp: answer.sdp } },
        })
      }
    }
    if (payload.candidate) {
      await this.addRemoteCandidate(payload.candidate)
    }
  }

  private async flushPendingSignals(): Promise<void> {
    if (!this.pc) return
    const pending = this.pendingSignals.splice(0)
    for (const payload of pending) {
      await this.applySignalPayload(payload)
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.pc?.remoteDescription) return
    const pending = this.pendingCandidates.splice(0)
    for (const candidate of pending) {
      try {
        await this.pc.addIceCandidate(candidate)
      } catch {
        /* stale candidate */
      }
    }
  }

  private async addRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate)
      return
    }
    try {
      await this.pc.addIceCandidate(candidate)
    } catch {
      /* stale candidate */
    }
  }

  private setupChannel(dc: RTCDataChannel): void {
    this.channel = dc
    dc.onopen = () => {
      if (this.connectTimeoutId) {
        clearTimeout(this.connectTimeoutId)
        this.connectTimeoutId = null
      }
      this.setState('connected', 'Connected — pick a game to play together!')
    }
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string)
        this.handlers.forEach((h) => h(msg))
      } catch {
        this.handlers.forEach((h) => h(e.data))
      }
    }
    dc.onclose = () => {
      if (this.connectionState === 'connected') {
        this.setState('peer-away', 'Connection paused — waiting for friend…')
      }
    }
  }

  private createPeer(): RTCPeerConnection {
    this.closeWebRTC()
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signaling.send({ type: 'signal', payload: { candidate: e.candidate.toJSON() } })
      }
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        this.emit({
          type: 'error',
          message:
            'Could not establish a direct connection between devices. Try a different network (e.g. turn off VPN), use two separate browsers/devices, or wait a moment and rejoin.',
        })
      }
    }
    pc.ondatachannel = (e) => this.setupChannel(e.channel)
    this.pc = pc
    return pc
  }

  private async createOffer(): Promise<void> {
    if (!this.pc || this.role !== 'host' || this.makingOffer) return
    this.makingOffer = true
    try {
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)
      this.signaling.send({
        type: 'signal',
        payload: { sdp: { type: offer.type, sdp: offer.sdp } },
      })
    } finally {
      this.makingOffer = false
    }
  }

  private wireSignaling(): void {
    if (this.signalingWired) return
    this.signalingWired = true

    this.signaling.on('signal', async (data) => {
      const msg = data as {
        payload?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
      }
      if (!msg.payload) return

      if (!this.pc) {
        this.pendingSignals.push(msg.payload)
        return
      }

      try {
        await this.applySignalPayload(msg.payload)
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'negotiation failed'
        this.emit({ type: 'error', message: `Could not complete peer handshake (${detail}). Try leaving and rejoining the room.` })
      }
    })

    this.signaling.on('peer-joined', async () => {
      this.setState('signaling', 'Friend joined — connecting…')
      await this.startWebRTCAsHost()
    })

    this.signaling.on('peer-rejoined', async () => {
      this.setState('signaling', 'Friend reconnected — connecting…')
      this.emit({ type: 'peer-back' })
      if (this.role === 'host') await this.startWebRTCAsHost()
      else await this.startWebRTCAsGuest()
    })

    this.signaling.on('peer-present', async () => {
      this.setState('signaling', 'Friend is in the room — connecting…')
      if (this.role === 'host') await this.startWebRTCAsHost()
      else await this.startWebRTCAsGuest()
    })

    this.signaling.on('peer-disconnected', (data) => {
      const msg = data as { role: string; reconnectUntil: number }
      this.closeWebRTC()
      this.pendingSignals = []
      this.setState('peer-away', `Friend stepped away — can rejoin for ${Math.round((msg.reconnectUntil - Date.now()) / 1000)}s`)
      this.emit({ type: 'peer-away', until: msg.reconnectUntil })
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
  }

  private async startWebRTCAsHost(): Promise<void> {
    if (this.webrtcStarting) return
    this.webrtcStarting = true
    try {
      this.createPeer()
      const ch = this.pc!.createDataChannel('game', { ordered: true })
      this.setupChannel(ch)
      await this.flushPendingSignals()
      this.armConnectTimeout()
      await this.createOffer()
    } finally {
      this.webrtcStarting = false
    }
  }

  private async startWebRTCAsGuest(): Promise<void> {
    if (this.webrtcStarting) return
    this.webrtcStarting = true
    try {
      this.createPeer()
      await this.flushPendingSignals()
      this.armConnectTimeout()
    } finally {
      this.webrtcStarting = false
    }
  }

  private armConnectTimeout(): void {
    if (this.connectTimeoutId) clearTimeout(this.connectTimeoutId)
    this.connectTimeoutId = setTimeout(() => {
      if (this.connectionState !== 'connected') {
        this.emit({
          type: 'error',
          message:
            'Peer connection timed out. Signaling worked but the direct link never opened — try two separate browsers or devices (not two tabs in the same browser), disable VPN/ad blockers, or switch networks.',
        })
      }
    }, 45_000)
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
      saveRoomPrefs(msg.code, msg.role)

      if (msg.role === 'host') {
        this.setState('waiting', `Rejoined room ${msg.code}`)
      } else {
        this.setState('signaling', 'In room — connecting to host…')
        void this.startWebRTCAsGuest()
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
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId)
      this.connectTimeoutId = null
    }
    this.inSignalingRoom = false
    this.closeWebRTC()
    this.pendingSignals = []
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
