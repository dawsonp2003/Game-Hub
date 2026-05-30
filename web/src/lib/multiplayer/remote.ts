import type { MultiplayerSession } from './session'
import { SignalingClient } from './signaling'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export interface RemoteSessionOptions {
  role: 'host' | 'guest'
  code?: string
  onCode?: (code: string) => void
  onStatus?: (status: string) => void
}

export async function createRemoteSession(
  options: RemoteSessionOptions,
): Promise<MultiplayerSession> {
  const signaling = new SignalingClient()
  const handlers = new Set<(message: unknown) => void>()
  let pc: RTCPeerConnection | null = null
  let channel: RTCDataChannel | null = null
  let connected = false

  const notify = (status: string) => options.onStatus?.(status)

  const session: MultiplayerSession = {
    role: options.role,
    get isConnected() {
      return connected
    },
    send(message) {
      if (channel?.readyState === 'open') {
        channel.send(JSON.stringify(message))
      }
    },
    onMessage(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    disconnect() {
      channel?.close()
      pc?.close()
      signaling.disconnect()
      handlers.clear()
      connected = false
    },
  }

  const setupChannel = (dc: RTCDataChannel) => {
    channel = dc
    dc.onopen = () => {
      connected = true
      notify('Connected! Start playing.')
    }
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string)
        handlers.forEach((h) => h(msg))
      } catch {
        handlers.forEach((h) => h(e.data))
      }
    }
    dc.onclose = () => {
      connected = false
      notify('Connection closed')
    }
  }

  const createPeer = () => {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signaling.send({ type: 'signal', payload: { candidate: e.candidate } })
      }
    }
    pc.ondatachannel = (e) => setupChannel(e.channel)
    return pc
  }

  notify('Connecting to server…')
  await signaling.connect()

  signaling.on('signal', async (data) => {
    const msg = data as { payload?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }
    if (!pc || !msg.payload) return

    if (msg.payload.sdp) {
      await pc.setRemoteDescription(msg.payload.sdp)
      if (msg.payload.sdp.type === 'offer' && options.role === 'guest') {
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        signaling.send({ type: 'signal', payload: { sdp: answer } })
      }
    }
    if (msg.payload.candidate) {
      try {
        await pc.addIceCandidate(msg.payload.candidate)
      } catch {
        /* ignore stale candidates */
      }
    }
  })

  signaling.on('peer-joined', async () => {
    if (options.role !== 'host' || !pc) return
    notify('Peer joined — establishing connection…')
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signaling.send({ type: 'signal', payload: { sdp: offer } })
  })

  signaling.on('peer-left', () => {
    notify('Other player left')
    session.disconnect()
  })

  signaling.on('error', (data) => {
    const msg = data as { message?: string }
    notify(msg.message ?? 'Connection error')
  })

  if (options.role === 'host') {
    createPeer()
    const ch = pc!.createDataChannel('game', { ordered: true })
    setupChannel(ch)

    notify('Creating room…')
    signaling.send({ type: 'create-room' })

    signaling.on('room-created', (data) => {
      const { code } = data as { code: string }
      options.onCode?.(code)
      notify(`Share code: ${code}`)
    })
  } else {
    createPeer()
    if (!options.code) throw new Error('Room code required')
    notify('Joining room…')
    signaling.send({ type: 'join-room', code: options.code })

    signaling.on('room-joined', () => {
      notify('Waiting for host to connect…')
    })
  }

  return session
}

export function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}
