/**
 * Room server smoke test: create → join → relay game message
 * Run: node server/scripts/test-signaling.mjs (with server on :3001)
 */
import WebSocket from 'ws'

const URL = process.env.SIGNALING_URL ?? 'ws://localhost:3001'

function once(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), 10000)
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.type === type) {
        clearTimeout(timer)
        resolve(msg)
      }
      if (msg.type === 'error') {
        clearTimeout(timer)
        reject(new Error(msg.message))
      }
    })
  })
}

function waitRelay(ws, expectedType) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for relay')), 10000)
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'relay' && msg.payload?.type === expectedType) {
        clearTimeout(timer)
        resolve(msg.payload)
      }
      if (msg.type === 'error') {
        clearTimeout(timer)
        reject(new Error(msg.message))
      }
    })
  })
}

const hostId = crypto.randomUUID()
const guestId = crypto.randomUUID()

const host = new WebSocket(URL)
await new Promise((r, j) => {
  host.on('open', r)
  host.on('error', j)
})

host.send(JSON.stringify({ type: 'create-room', clientId: hostId }))
const created = await once(host, 'room-created')
console.log('Host created room:', created.code)

const guest = new WebSocket(URL)
await new Promise((r, j) => {
  guest.on('open', r)
  guest.on('error', j)
})

guest.send(JSON.stringify({ type: 'join-room', code: created.code, clientId: guestId }))
const [joined, peerJoined] = await Promise.all([
  once(guest, 'room-joined'),
  once(host, 'peer-joined'),
])
console.log('Guest joined:', joined.role)
console.log('Host got peer-joined:', peerJoined.role)

const relayPromise = waitRelay(host, 'room:launch')
guest.send(
  JSON.stringify({
    type: 'relay',
    clientId: guestId,
    payload: { type: 'room:launch', gameId: 'tic-tac-toe', gameName: 'Tic Tac Toe' },
  }),
)
const relayed = await relayPromise
console.log('Host received relay:', relayed.type, relayed.gameId)
console.log('Room relay flow OK')

host.close()
guest.close()
process.exit(0)
