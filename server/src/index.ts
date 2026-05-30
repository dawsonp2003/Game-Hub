import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'

const PORT = Number(process.env.PORT) || 3001
const ROOM_TTL_MS = 30 * 60 * 1000
const GRACE_MS = 60_000

interface Slot {
  clientId: string
  ws: WebSocket | null
  disconnectedAt: number | null
}

interface Room {
  code: string
  host: Slot
  guest: Slot | null
  createdAt: number
}

const rooms = new Map<string, Room>()
const wsRoom = new WeakMap<WebSocket, string>()
const wsClientId = new WeakMap<WebSocket, string>()

function generateCode(): string {
  let code: string
  do {
    code = String(Math.floor(100000 + Math.random() * 900000))
  } while (rooms.has(code))
  return code
}

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

function getPeer(room: Room, ws: WebSocket): WebSocket | null {
  if (room.host.ws === ws) return room.guest?.ws ?? null
  if (room.guest?.ws === ws) return room.host.ws
  return null
}

function slotVacant(slot: Slot): boolean {
  if (slot.ws) return false
  if (!slot.disconnectedAt) return true
  return Date.now() - slot.disconnectedAt > GRACE_MS
}

function notifyPeerDisconnected(room: Room, who: 'host' | 'guest', peer: WebSocket | null): void {
  if (!peer) return
  const slot = who === 'host' ? room.host : room.guest!
  send(peer, {
    type: 'peer-disconnected',
    role: who,
    reconnectUntil: (slot.disconnectedAt ?? Date.now()) + GRACE_MS,
  })
}

function markDisconnected(room: Room, ws: WebSocket): 'host' | 'guest' | null {
  if (room.host.ws === ws) {
    room.host.ws = null
    room.host.disconnectedAt = Date.now()
    return 'host'
  }
  if (room.guest?.ws === ws) {
    room.guest.ws = null
    room.guest.disconnectedAt = Date.now()
    return 'guest'
  }
  return null
}

function assignToSlot(
  room: Room,
  role: 'host' | 'guest',
  clientId: string,
  ws: WebSocket,
): boolean {
  const slot = role === 'host' ? room.host : room.guest
  if (!slot) return false

  if (slot.ws) return false

  if (slot.clientId === clientId) {
    slot.ws = ws
    slot.disconnectedAt = null
    return true
  }

  if (slotVacant(slot)) {
    slot.clientId = clientId
    slot.ws = ws
    slot.disconnectedAt = null
    return true
  }

  return false
}

function cleanupRoom(code: string): void {
  rooms.delete(code)
}

function scheduleRoomCleanup(code: string): void {
  setTimeout(() => {
    const room = rooms.get(code)
    if (!room) return

    const hostGone = slotVacant(room.host) && !room.host.ws
    const guestGone = !room.guest || (slotVacant(room.guest) && !room.guest.ws)

    if (hostGone && guestGone) {
      if (room.host.ws) send(room.host.ws, { type: 'room-closed', reason: 'expired' })
      if (room.guest?.ws) send(room.guest.ws, { type: 'room-closed', reason: 'expired' })
      cleanupRoom(code)
    }
  }, GRACE_MS + 500)
}

function attachClient(ws: WebSocket): void {
  let intentionalLeave = false

  ws.on('message', (raw: RawData) => {
    let msg: { type: string; code?: string; clientId?: string; payload?: unknown }
    try {
      msg = JSON.parse(raw.toString()) as typeof msg
    } catch {
      send(ws, { type: 'error', message: 'Invalid message' })
      return
    }

    const clientId = msg.clientId?.trim()
    if (!clientId && msg.type !== 'signal') {
      send(ws, { type: 'error', message: 'clientId required' })
      return
    }

    switch (msg.type) {
      case 'create-room': {
        if (wsRoom.has(ws)) return
        const code = generateCode()
        const room: Room = {
          code,
          host: { clientId: clientId!, ws, disconnectedAt: null },
          guest: null,
          createdAt: Date.now(),
        }
        rooms.set(code, room)
        wsRoom.set(ws, code)
        wsClientId.set(ws, clientId!)
        send(ws, { type: 'room-created', code, role: 'host' })
        break
      }

      case 'join-room': {
        const code = msg.code?.replace(/\D/g, '').slice(0, 6)
        if (!code || code.length !== 6) {
          send(ws, { type: 'error', message: 'Invalid room code' })
          return
        }
        const room = rooms.get(code)
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found' })
          return
        }

        if (room.host.clientId === clientId) {
          if (!assignToSlot(room, 'host', clientId!, ws)) {
            send(ws, { type: 'error', message: 'Could not rejoin as host' })
            return
          }
          wsRoom.set(ws, code)
          wsClientId.set(ws, clientId!)
          send(ws, { type: 'room-joined', code, role: 'host', rejoin: true })
          if (room.guest?.ws) {
            send(ws, { type: 'peer-present', role: 'guest' })
            send(room.guest.ws, { type: 'peer-rejoined', role: 'host' })
          }
          break
        }

        if (!room.guest) {
          room.guest = { clientId: clientId!, ws, disconnectedAt: null }
        } else if (!assignToSlot(room, 'guest', clientId!, ws)) {
          send(ws, { type: 'error', message: 'Room is full' })
          return
        }

        wsRoom.set(ws, code)
        wsClientId.set(ws, clientId!)
        send(ws, { type: 'room-joined', code, role: 'guest' })
        if (room.host.ws) {
          send(room.host.ws, { type: 'peer-joined', role: 'guest' })
        }
        break
      }

      case 'leave-room': {
        intentionalLeave = true
        const code = wsRoom.get(ws)
        if (!code) return
        const room = rooms.get(code)
        if (!room) return

        const who = markDisconnected(room, ws)
        wsRoom.delete(ws)

        if (who === 'host') {
          if (room.guest?.ws) {
            send(room.guest.ws, { type: 'peer-disconnected', role: 'host', reconnectUntil: Date.now() + GRACE_MS })
          }
        } else if (who === 'guest' && room.host.ws) {
          send(room.host.ws, { type: 'peer-disconnected', role: 'guest', reconnectUntil: Date.now() + GRACE_MS })
        }

        send(ws, { type: 'left-room' })
        scheduleRoomCleanup(code)
        break
      }

      case 'close-room': {
        intentionalLeave = true
        const code = wsRoom.get(ws)
        if (!code) return
        const room = rooms.get(code)
        if (!room || room.host.ws !== ws) {
          send(ws, { type: 'error', message: 'Only the host can close the room' })
          return
        }

        if (room.guest?.ws) send(room.guest.ws, { type: 'room-closed', reason: 'host-closed' })
        send(ws, { type: 'room-closed', reason: 'host-closed' })
        cleanupRoom(code)
        break
      }

      case 'signal': {
        const code = wsRoom.get(ws)
        if (!code) return
        const room = rooms.get(code)
        if (!room) return
        const peer = getPeer(room, ws)
        if (peer) send(peer, { type: 'signal', payload: msg.payload })
        break
      }

      default:
        send(ws, { type: 'error', message: 'Unknown message type' })
    }
  })

  ws.on('close', () => {
    if (intentionalLeave) return
    const code = wsRoom.get(ws)
    if (!code) return
    const room = rooms.get(code)
    if (!room) return

    const who = markDisconnected(room, ws)
    wsRoom.delete(ws)

    if (!who) return

    const peer = who === 'host' ? room.guest?.ws : room.host.ws
    notifyPeerDisconnected(room, who, peer ?? null)
    scheduleRoomCleanup(code)
  })
}

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'game-arcade-signaling', rooms: rooms.size }))
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Game Arcade signaling server\n')
})

const wss = new WebSocketServer({ server: httpServer })
wss.on('connection', attachClient)

setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      if (room.host.ws) send(room.host.ws, { type: 'room-closed', reason: 'expired' })
      if (room.guest?.ws) send(room.guest.ws, { type: 'room-closed', reason: 'expired' })
      cleanupRoom(code)
    }
  }
}, 60_000)

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`)
})
