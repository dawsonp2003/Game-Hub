import type { IncomingMessage, ServerResponse } from 'http'

const TIER_IMAGE_ITEMS_MAX = 60
const IMAGE_SEARCH_CONCURRENCY = 2
const IMAGE_SEARCH_MAX_ATTEMPTS = 4
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

const BAD_IMAGE_RE =
  /logo|icon|banner|wordmark|favicon|clipart|diagram|infographic|map|chart|graph|screenshot|sprite[\s_-]?sheet|book[\s_-]?cover|hardcover|paperback|poster[\s_-]?art|amazon\.com|goodreads|imdb[\s_-]?logo|wikipedia[\s_-]?logo|wikimedia[\s_-]?commons|\.svg(\?|$)/i

const AUTH_FAILED = new Set([401, 403])

interface ImageSearchResult {
  title: string
  pageUrl: string
  imageUrl: string
  thumbnailUrl?: string
}

interface TierImageItem {
  label: string
  imageQuery?: string
  searchTerm?: string
}

let serperAuthOk: boolean | null = null

function getSerperApiKey(): string | undefined {
  const key = process.env.SERPER_API_KEY?.trim()
  return key || undefined
}

function getBraveApiKey(): string | undefined {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim()
  return key || undefined
}

export function getTierImageProvider(): 'serper' | 'brave' | 'none' {
  if (getSerperApiKey() && serperAuthOk !== false) return 'serper'
  if (getBraveApiKey()) return 'brave'
  return 'none'
}

export function buildImageSearchQuery(
  label: string,
  topicPrompt?: string,
  imageQuery?: string,
): string {
  const explicit = imageQuery?.trim()
  if (explicit) return explicit

  const name = label.trim()
  const topic = topicPrompt?.trim()
  if (topic && !name.toLowerCase().includes(topic.toLowerCase())) {
    return `${name} ${topic}`
  }
  return name
}

function scoreImageCandidate(result: ImageSearchResult, query: string): number {
  const haystack = `${result.title} ${result.pageUrl} ${result.imageUrl}`.toLowerCase()
  let score = 0

  for (const token of query.toLowerCase().split(/\s+/).filter((t) => t.length > 2)) {
    if (haystack.includes(token)) score += 4
  }

  if (/character|portrait|actor|actress|official|artwork|film|movie|still|promo|cast/i.test(haystack)) {
    score += 8
  }
  if (/photo|photograph|headshot/i.test(haystack)) score += 3
  if (BAD_IMAGE_RE.test(haystack)) score -= 20
  if (result.thumbnailUrl) score += 2
  if (/encrypted-tbn|gstatic\.com/i.test(result.imageUrl)) score += 3

  return score
}

function pickBestImage(results: ImageSearchResult[], query: string): string | undefined {
  if (results.length === 0) return undefined

  const ranked = [...results].sort(
    (a, b) => scoreImageCandidate(b, query) - scoreImageCandidate(a, query),
  )

  const best = ranked[0]
  if (!best || scoreImageCandidate(best, query) < -5) return undefined
  return best.thumbnailUrl || best.imageUrl
}

function isAuthError(status: number): boolean {
  return AUTH_FAILED.has(status)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.max(500, seconds * 1000)
  }
  return 800 * 2 ** (attempt - 1)
}

async function searchSerperImages(query: string): Promise<ImageSearchResult[]> {
  const apiKey = getSerperApiKey()
  if (!apiKey || serperAuthOk === false) return []

  for (let attempt = 1; attempt <= IMAGE_SEARCH_MAX_ATTEMPTS; attempt++) {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({ q: query, num: 8 }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (isAuthError(res.status)) {
        serperAuthOk = false
        throw new SerperAuthError(`Serper images ${res.status}: ${text.slice(0, 120)}`)
      }
      if (RETRYABLE_STATUS.has(res.status) && attempt < IMAGE_SEARCH_MAX_ATTEMPTS) {
        const delay = retryDelayMs(res, attempt)
        console.warn(
          `tier-images: Serper ${res.status} for "${query}", retry ${attempt}/${IMAGE_SEARCH_MAX_ATTEMPTS} in ${delay}ms`,
        )
        await sleep(delay)
        continue
      }
      throw new Error(`Serper images ${res.status}: ${text.slice(0, 120)}`)
    }

    serperAuthOk = true

    const data = (await res.json()) as {
      images?: {
        title?: string
        link?: string
        imageUrl?: string
        thumbnailUrl?: string
      }[]
    }

    return (data.images ?? [])
      .filter((img) => img.imageUrl)
      .map((img) => ({
        title: img.title ?? '',
        pageUrl: img.link ?? '',
        imageUrl: img.imageUrl!,
        thumbnailUrl: img.thumbnailUrl,
      }))
  }

  return []
}

async function searchBraveImages(query: string): Promise<ImageSearchResult[]> {
  const apiKey = getBraveApiKey()
  if (!apiKey) return []

  const url = new URL('https://api.search.brave.com/res/v1/images/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', '8')
  url.searchParams.set('safesearch', 'moderate')
  url.searchParams.set('spellcheck', '1')

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (isAuthError(res.status)) {
      throw new BraveAuthError(`Brave images ${res.status}: ${text.slice(0, 120)}`)
    }
    throw new Error(`Brave images ${res.status}: ${text.slice(0, 120)}`)
  }

  const data = (await res.json()) as {
    results?: {
      title?: string
      url?: string
      source?: string
      thumbnail?: { src?: string }
      properties?: { url?: string }
    }[]
  }

  const mapped: ImageSearchResult[] = []
  for (const img of data.results ?? []) {
    const imageUrl = img.properties?.url ?? img.url ?? ''
    if (!imageUrl) continue
    mapped.push({
      title: img.title ?? '',
      pageUrl: img.source ?? img.url ?? '',
      imageUrl,
      thumbnailUrl: img.thumbnail?.src,
    })
  }
  return mapped
}

class SerperAuthError extends Error {
  readonly name = 'SerperAuthError'
}

class BraveAuthError extends Error {
  readonly name = 'BraveAuthError'
}

export async function resolveImageForQuery(query: string): Promise<string | undefined> {
  const trimmed = query.trim()
  if (!trimmed) return undefined

  const provider = getTierImageProvider()
  let results: ImageSearchResult[] = []

  if (provider === 'serper') {
    results = await searchSerperImages(trimmed)
  } else if (provider === 'brave') {
    results = await searchBraveImages(trimmed)
  } else {
    return undefined
  }

  return pickBestImage(results, trimmed)
}

/** Verify Serper key on startup — logs a clear message if the key is rejected. */
export async function validateTierImageProvider(): Promise<void> {
  const serperKey = getSerperApiKey()
  if (!serperKey) return

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': serperKey,
      },
      body: JSON.stringify({ q: 'test', num: 1 }),
    })

    if (isAuthError(res.status)) {
      serperAuthOk = false
      console.warn(
        'Tier list images: SERPER_API_KEY was rejected (403). Get a key from https://serper.dev/api-key — not SerpAPI or other sites. Wikipedia fallback will be used.',
      )
      return
    }

    if (res.ok) {
      serperAuthOk = true
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    console.warn(`Tier list images: could not verify Serper key — ${message}`)
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

export async function handleTierImages(
  req: IncomingMessage,
  res: ServerResponse,
  readJsonBody: (req: IncomingMessage, maxBytes: number) => Promise<unknown>,
  allowRequest: () => boolean,
): Promise<void> {
  if (!allowRequest()) {
    res.writeHead(429, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Rate limit exceeded' }))
    return
  }

  const provider = getTierImageProvider()
  if (provider === 'none') {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Image search not configured', configured: false }))
    return
  }

  try {
    const body = (await readJsonBody(req, 32_768)) as {
      topicPrompt?: string
      items?: TierImageItem[]
    }

    const topicPrompt = typeof body.topicPrompt === 'string' ? body.topicPrompt.trim() : ''
    const items = Array.isArray(body.items) ? body.items : []

    if (items.length === 0 || items.length > TIER_IMAGE_ITEMS_MAX) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid items list' }))
      return
    }

    const normalized = items
      .filter((item) => typeof item?.label === 'string' && item.label.trim())
      .map((item) => ({
        label: item.label.trim(),
        imageQuery: typeof item.imageQuery === 'string' ? item.imageQuery.trim() : undefined,
        searchTerm: typeof item.searchTerm === 'string' ? item.searchTerm.trim() : undefined,
      }))

    let authFailed = false

    const results = await mapPool(normalized, IMAGE_SEARCH_CONCURRENCY, async (item) => {
      if (authFailed) {
        return { label: item.label, imageUrl: undefined, query: buildImageSearchQuery(item.label, topicPrompt, item.imageQuery) }
      }

      const query = buildImageSearchQuery(item.label, topicPrompt, item.imageQuery)
      try {
        const imageUrl = await resolveImageForQuery(query)
        return { label: item.label, imageUrl, query }
      } catch (e) {
        if (e instanceof SerperAuthError || e instanceof BraveAuthError) {
          authFailed = true
          console.warn(`tier-images: provider auth failed — ${e.message}`)
          return { label: item.label, imageUrl: undefined, query }
        }
        const message = e instanceof Error ? e.message : 'image search failed'
        console.warn(`tier-images: "${query}" — ${message}`)
        return { label: item.label, imageUrl: undefined, query }
      }
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        items: results.map(({ label, imageUrl, query }) => ({ label, imageUrl, query })),
        provider,
        configured: true,
        authFailed,
      }),
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    console.error('tier-images error:', message)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Image search failed' }))
  }
}
