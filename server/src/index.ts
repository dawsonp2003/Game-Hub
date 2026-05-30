import { createServer } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'

const PORT = Number(process.env.PORT) || 3001
const ROOM_TTL_MS = 30 * 60 * 1000

interface Room {
  code: string
  host: WebSocket
  guest?: WebSocket
  createdAt: number
}

const rooms = new Map<string, Room>()

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

function relayToPeer(sender: WebSocket, room: Room, data: unknown): void {
  const target = sender === room.host ? room.guest : room.host
  if (target) send(target, data)
}

function cleanupRoom(code: string): void {
  rooms.delete(code)
}

function attachClient(ws: WebSocket): void {
  let roomCode: string | null = null

  ws.on('message', (raw) => {
    let msg: { type: string; code?: string; payload?: unknown }
    try {
      msg = JSON.parse(raw.toString()) as { type: string; code?: string; payload?: unknown }
    } catch {
      send(ws, { type: 'error', message: 'Invalid message' })
      return
    }

    switch (msg.type) {
      case 'create-room': {
        if (roomCode) return
        const code = generateCode()
        const room: Room = { code, host: ws, createdAt: Date.now() }
        rooms.set(code, room)
        roomCode = code
        send(ws, { type: 'room-created', code })
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
        if (room.guest) {
          send(ws, { type: 'error', message: 'Room is full' })
          return
        }
        room.guest = ws
        roomCode = code
        send(ws, { type: 'room-joined' })
        send(room.host, { type: 'peer-joined' })
        break
      }

      case 'signal': {
        if (!roomCode) return
        const room = rooms.get(roomCode)
        if (!room) return
        relayToPeer(ws, room, { type: 'signal', payload: msg.payload })
        break
      }

      default:
        send(ws, { type: 'error', message: 'Unknown message type' })
    }
  })

  ws.on('close', () => {
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room) return

    const peer = ws === room.host ? room.guest : room.host
    if (peer) {
      send(peer, { type: 'peer-left' })
    }
    cleanupRoom(roomCode)
  })
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Game Arcade signaling server\n')
})

const wss = new WebSocketServer({ server: httpServer })
wss.on('connection', attachClient)

setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      send(room.host, { type: 'error', message: 'Room expired' })
      room.guest && send(room.guest, { type: 'error', message: 'Room expired' })
      cleanupRoom(code)
    }
  }
}, 60_000)

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`)
})
