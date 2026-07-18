import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import { getTierImageProvider, handleTierImages, validateTierImageProvider } from './tier-images.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

const PORT = Number(process.env.PORT) || 3001
const ROOM_TTL_MS = 30 * 60 * 1000
const GRACE_MS = 60_000
const RELAY_MAX_PER_SEC = 40
const RELAY_MAX_BYTES = 8192
const TIER_API_MAX_PER_MIN = 10
const TIER_PROMPT_MAX_LEN = 200
const TIER_ITEMS_MAX = 60

/** Tried in order when a model is overloaded (503) or rate-limited. */
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ?? [
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
  ]
)

const GEMINI_RETRYABLE = new Set([429, 500, 502, 503])
const GEMINI_MAX_RETRIES = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getGeminiApiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY?.trim()
  return key || undefined
}

interface Slot {
  clientId: string
  accountId: string | null
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
const relayBuckets = new Map<string, { count: number; resetAt: number }>()
const tierApiBuckets = new Map<string, { count: number; resetAt: number }>()

function verifyClient(ws: WebSocket, clientId: string | undefined): boolean {
  if (!clientId) return false
  const bound = wsClientId.get(ws)
  return bound === clientId
}

function allowRelay(clientId: string): boolean {
  const now = Date.now()
  let bucket = relayBuckets.get(clientId)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 1000 }
    relayBuckets.set(clientId, bucket)
  }
  bucket.count++
  return bucket.count <= RELAY_MAX_PER_SEC
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim()
  return req.socket.remoteAddress ?? 'unknown'
}

function allowTierApi(ip: string): boolean {
  const now = Date.now()
  let bucket = tierApiBuckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 }
    tierApiBuckets.set(ip, bucket)
  }
  bucket.count++
  return bucket.count <= TIER_API_MAX_PER_MIN
}

function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

interface TierItemResponse {
  label: string
  searchTerm: string
  imageQuery: string
  description: string
}

function buildGeminiRequestBody(prompt: string, max: number) {
  return {
    contents: [
      {
        parts: [
          {
            text: `Return a complete list of items from a provided topic; return individual rankable THINGS (characters, species, foods, movies, songs, etc.)

Examples:
- "Pokemon" → Pikachu, Charizard, Mewtwo, Bulbasaur, Eevee, Lucario, Gengar, … (individual Pokémon species)
- "Mario characters" → Mario, Luigi, Peach, Bowser, Yoshi, Toad, …
- "Harry Potter characters" → label "Harry Potter", imageQuery "Harry Potter Harry Potter film character"; label "Hermione Granger", imageQuery "Hermione Granger Harry Potter film character"
- "Project Hail Mary characters" → label "Senior Researcher Dubois", imageQuery "Senior Researcher Dubois Project Hail Mary movie character"; label "Rocky", imageQuery "Rocky Project Hail Mary movie alien"
- "superhero villains" → Joker, Thanos, Loki, Magneto, …

Rules:
- Return up to ${max} distinct, recognizable items fans would want to rank
- "label": short display name shown on the card
- "description": one concise sentence (maximum 30 words) identifying the item and explaining its role or significance within the user's topic. Do not include the label as a heading.
- "imageQuery": a Google Images search phrase that finds a good picture of THIS specific item in the context of the user's topic. Always include the work/franchise/source when the name alone is ambiguous (e.g. book vs film character, common surname, generic title). Prefer queries that return character portraits, cast photos, or official artwork — NOT book covers, logos, or unrelated historical people.
- "searchTerm": short Wikipedia-style name as a fallback only (e.g. "Pikachu", "Hermione Granger")
- No duplicates; skip obscure entries when the topic is huge — pick well-known fan favorites
- Never return list pages, disambiguation pages, or video-game-series articles

User prompt: "${prompt}"`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                label: { type: 'STRING' },
                searchTerm: { type: 'STRING' },
                imageQuery: { type: 'STRING' },
                description: { type: 'STRING' },
              },
              required: ['label', 'imageQuery', 'description'],
            },
          },
        },
        required: ['items'],
      },
    },
  }
}

function parseGeminiItems(text: string, max: number): TierItemResponse[] {
  const parsed = JSON.parse(text) as { items?: TierItemResponse[] }
  if (!Array.isArray(parsed.items)) throw new Error('invalid gemini schema')

  return parsed.items
    .filter((i) => typeof i.label === 'string' && i.label.trim())
    .map((i) => ({
      label: i.label.trim(),
      searchTerm: (typeof i.searchTerm === 'string' ? i.searchTerm : i.label).trim(),
      imageQuery: (
        typeof i.imageQuery === 'string' && i.imageQuery.trim()
          ? i.imageQuery
          : typeof i.searchTerm === 'string' && i.searchTerm.trim()
            ? i.searchTerm
            : i.label
      ).trim(),
      description:
        typeof i.description === 'string'
          ? i.description.trim().split(/\s+/).slice(0, 30).join(' ')
          : '',
    }))
    .slice(0, max)
}

async function callGeminiModel(
  model: string,
  apiKey: string,
  prompt: string,
  max: number,
): Promise<TierItemResponse[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = buildGeminiRequestBody(prompt, max)

  let lastError = 'unknown error'

  for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('empty gemini response')
      return parseGeminiItems(text, max)
    }

    const errText = await res.text().catch(() => '')
    lastError = `Gemini API error ${res.status}: ${errText.slice(0, 200)}`

    if (GEMINI_RETRYABLE.has(res.status) && attempt < GEMINI_MAX_RETRIES) {
      const delayMs = 600 * 2 ** (attempt - 1)
      console.warn(`tier-items: ${model} ${res.status}, retry ${attempt}/${GEMINI_MAX_RETRIES} in ${delayMs}ms`)
      await sleep(delayMs)
      continue
    }

    throw new Error(lastError)
  }

  throw new Error(lastError)
}

async function generateTierItems(
  prompt: string,
  max: number,
): Promise<{ items: TierItemResponse[]; model: string }> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) throw new Error('no api key')

  let lastError: Error | null = null

  for (const model of GEMINI_MODELS) {
    try {
      const items = await callGeminiModel(model, apiKey, prompt, max)
      return { items, model }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('unknown error')
      console.warn(`tier-items: ${model} failed — ${lastError.message}`)
    }
  }

  throw lastError ?? new Error('all Gemini models failed')
}

async function handleTierItems(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ip = getClientIp(req)
  if (!allowTierApi(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Rate limit exceeded' }))
    return
  }

  if (!getGeminiApiKey()) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'LLM not configured', fallback: true }))
    return
  }

  try {
    const body = (await readJsonBody(req, 4096)) as { prompt?: string; max?: number }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const max = Math.min(
      TIER_ITEMS_MAX,
      Math.max(1, typeof body.max === 'number' && Number.isFinite(body.max) ? Math.floor(body.max) : 30),
    )

    if (!prompt || prompt.length > TIER_PROMPT_MAX_LEN) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid prompt' }))
      return
    }

    const { items, model } = await generateTierItems(prompt, max)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ items, source: 'llm', model }))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    console.error('tier-items error:', message)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Generation failed', fallback: true }))
  }
}

function isValidRelayPayload(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
}

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

/** Same permanent account connected live in this slot (grace-period holds do not count). */
function isAccountLiveInSlot(slot: Slot, accountId: string, exceptClientId?: string): boolean {
  if (!slot.accountId || slot.accountId !== accountId || !slot.ws) return false
  if (exceptClientId && slot.clientId === exceptClientId) return false
  return true
}

function isAccountActiveInRoom(room: Room, accountId: string, exceptClientId?: string): boolean {
  if (isAccountLiveInSlot(room.host, accountId, exceptClientId)) return true
  if (room.guest && isAccountLiveInSlot(room.guest, accountId, exceptClientId)) return true
  return false
}

function isAccountActiveAnywhere(accountId: string, exceptClientId?: string): boolean {
  for (const room of rooms.values()) {
    if (isAccountActiveInRoom(room, accountId, exceptClientId)) return true
  }
  return false
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
    room.host.accountId = null
    return 'host'
  }
  if (room.guest?.ws === ws) {
    room.guest.ws = null
    room.guest.disconnectedAt = Date.now()
    room.guest.accountId = null
    return 'guest'
  }
  return null
}

function assignToSlot(
  room: Room,
  role: 'host' | 'guest',
  clientId: string,
  ws: WebSocket,
  accountId: string | null,
): boolean {
  const slot = role === 'host' ? room.host : room.guest
  if (!slot) return false

  if (slot.ws) return false

  if (slot.clientId === clientId) {
    slot.ws = ws
    slot.disconnectedAt = null
    if (accountId) slot.accountId = accountId
    return true
  }

  if (slotVacant(slot)) {
    slot.clientId = clientId
    slot.accountId = accountId
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
    const rawText = raw.toString()
    if (rawText.length > RELAY_MAX_BYTES + 512) {
      send(ws, { type: 'error', message: 'Message too large' })
      return
    }

    let msg: {
      type: string
      code?: string
      clientId?: string
      accountId?: string
      payload?: unknown
    }
    try {
      msg = JSON.parse(raw.toString()) as typeof msg
    } catch {
      send(ws, { type: 'error', message: 'Invalid message' })
      return
    }

    const clientId = msg.clientId?.trim()
    const accountId = msg.accountId?.trim() || null
    if (!clientId) {
      send(ws, { type: 'error', message: 'clientId required' })
      return
    }

    switch (msg.type) {
      case 'create-room': {
        if (wsRoom.has(ws)) return
        if (accountId && isAccountActiveAnywhere(accountId)) {
          send(ws, {
            type: 'error',
            message:
              'This account is already connected in another tab or device. Leave that room first, then try again.',
          })
          return
        }
        const code = generateCode()
        const room: Room = {
          code,
          host: { clientId: clientId!, accountId, ws, disconnectedAt: null },
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

        if (accountId && isAccountActiveInRoom(room, accountId, clientId)) {
          send(ws, {
            type: 'error',
            message:
              'This account is already connected in this room from another tab. Close the other tab or leave there first.',
          })
          return
        }

        if (room.host.clientId === clientId) {
          if (!assignToSlot(room, 'host', clientId!, ws, accountId)) {
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

        if (accountId && room.host.accountId === accountId && room.host.ws) {
          send(ws, {
            type: 'error',
            message:
              'This account is already connected as host in this room from another tab.',
          })
          return
        }

        if (!room.guest) {
          room.guest = { clientId: clientId!, accountId, ws, disconnectedAt: null }
        } else if (!assignToSlot(room, 'guest', clientId!, ws, accountId)) {
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
        if (!verifyClient(ws, clientId)) {
          send(ws, { type: 'error', message: 'clientId mismatch' })
          return
        }
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
        if (!verifyClient(ws, clientId)) {
          send(ws, { type: 'error', message: 'clientId mismatch' })
          return
        }
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

      case 'relay': {
        const code = wsRoom.get(ws)
        if (!code) {
          send(ws, { type: 'error', message: 'Not in a room' })
          return
        }
        if (!verifyClient(ws, clientId)) {
          send(ws, { type: 'error', message: 'clientId mismatch' })
          return
        }
        if (!allowRelay(clientId!)) {
          send(ws, { type: 'error', message: 'Sending too fast — slow down' })
          return
        }
        if (!isValidRelayPayload(msg.payload)) {
          send(ws, { type: 'error', message: 'Invalid relay payload' })
          return
        }
        const payloadJson = JSON.stringify(msg.payload)
        if (payloadJson.length > RELAY_MAX_BYTES) {
          send(ws, { type: 'error', message: 'Relay payload too large' })
          return
        }

        const room = rooms.get(code)
        if (!room) return
        const peer = getPeer(room, ws)
        if (!peer) return

        send(peer, { type: 'relay', payload: msg.payload })
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        service: 'game-arcade-room-server',
        rooms: rooms.size,
        tierLlm: !!getGeminiApiKey(),
        tierLlmModels: GEMINI_MODELS,
        tierImages: getTierImageProvider(),
      }),
    )
    return
  }

  if (req.method === 'POST' && req.url === '/api/tier-items') {
    void handleTierItems(req, res)
    return
  }

  if (req.method === 'POST' && req.url === '/api/tier-images') {
    void handleTierImages(req, res, readJsonBody, () => allowTierApi(getClientIp(req)))
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Game Arcade room server\n')
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
  const llm = getGeminiApiKey()
  const images = getTierImageProvider()
  console.log(`Signaling server listening on port ${PORT}`)
  console.log(
    llm
      ? `Tier list LLM: enabled (${GEMINI_MODELS.join(' → ')})`
      : 'Tier list LLM: disabled — set GEMINI_API_KEY in server/.env',
  )
  console.log(
    images !== 'none'
      ? `Tier list images: enabled (${images})`
      : getSerperApiKeyForLog()
        ? 'Tier list images: SERPER_API_KEY set but not validated yet'
        : 'Tier list images: disabled — set SERPER_API_KEY or BRAVE_SEARCH_API_KEY in server/.env',
  )
  void validateTierImageProvider().then(() => {
    const after = getTierImageProvider()
    if (after === 'none' && process.env.SERPER_API_KEY?.trim()) {
      console.warn('Tier list images: falling back to Wikipedia only until SERPER_API_KEY is fixed')
    }
  })
})

function getSerperApiKeyForLog(): boolean {
  return !!process.env.SERPER_API_KEY?.trim()
}
