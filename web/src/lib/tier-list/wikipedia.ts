import {
  detectCharacterTopic,
  extractWorkTitleFromTopic,
  isFranchiseAmbiguousName,
  normalizeCharacterSearchTerm,
} from './image-context'

const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const WIKI_REST_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary'
const THUMB_WIDTH = 200
const RESOLVE_CONCURRENCY = 3
const WIKI_MAX_ATTEMPTS = 3

const BAD_IMAGE_RE =
  /cover|book[\s_]?cover|poster|logo|icon|box[\s_]?art|banner|screenshot|film|movie|dvd|promotional|wordmark|favicon|seal|emblem|title[\s_]?card|gameplay|map|menu|header|hardcover|paperback|first[\s_]?edition|scholastic|bloomsbury/i

const BAD_PAGE_RE =
  /\(film\)|\(video game\)|\(TV series\)|\(television series\)|\(novel\)|\(book\)|\(book series\)|\(album\)|\(franchise\)|\(series\)|\(literary series\)$/i

export interface WikiSearchResult {
  label: string
  wikiTitle: string
}

interface WikiPageImage {
  title: string
  missing?: string
  pageprops?: { page_image?: string }
  thumbnail?: { source: string }
  images?: { title: string }[]
}

interface WikiSummary {
  type?: string
  title?: string
  thumbnail?: { source: string }
}

async function wikiQuery(params: Record<string, string>): Promise<unknown> {
  const url = new URL(WIKI_API)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')

  for (let attempt = 1; attempt <= WIKI_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url.toString())
    if (res.ok) return res.json()

    if ((res.status === 429 || res.status >= 500) && attempt < WIKI_MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const delay = Number.isFinite(retryAfter)
        ? Math.max(500, retryAfter * 1000)
        : 700 * 2 ** (attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
      continue
    }

    throw new Error(`Wikipedia API error: ${res.status}`)
  }

  throw new Error('Wikipedia API request failed')
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx]!, idx)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function wikiSlug(title: string): string {
  return encodeURIComponent(title.replace(/ /g, '_'))
}

function isBadPageTitle(title: string): boolean {
  if (!isRankableWikiTitle(title)) return true
  if (BAD_PAGE_RE.test(title)) return true
  if (title.toLowerCase().endsWith(' series')) return true
  return false
}

function scorePageTitle(title: string, label: string, characterTopic: boolean, workTitle?: string): number {
  const lower = title.toLowerCase()
  const labelLower = label.toLowerCase()
  let score = 0

  if (workTitle && lower.includes(workTitle.toLowerCase())) score += 18
  if (lower === `${labelLower} (character)`) score += 30
  if (lower.includes('(fictional character)') || lower.includes('(literary character)')) score += 28
  if (lower.includes('(character)')) score += 22
  if (lower === labelLower && characterTopic) score -= 20
  if (lower === labelLower && isFranchiseAmbiguousName(label)) score -= 35
  if (lower === labelLower) score += 4
  if (lower.includes('species') || lower.includes('pokémon') || lower.includes('pokemon')) score += 10
  if (BAD_PAGE_RE.test(title)) score -= 40
  if (lower.includes('disambiguation')) score -= 25
  if (lower.includes('(series)')) score -= 30
  return score
}

function scoreImageFile(fileTitle: string, label: string): number {
  const name = fileTitle.replace(/^File:/i, '')
  const lower = name.toLowerCase()
  const tokens = label.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  let score = 0

  for (const token of tokens) {
    if (lower.includes(token)) score += 10
  }
  if (/art|render|illustration|portrait|sprite|official|character/i.test(lower)) score += 8
  if (/pokémon|pokemon/i.test(lower) && /pokémon|pokemon/i.test(label.toLowerCase())) score += 6
  if (BAD_IMAGE_RE.test(lower)) score -= 25
  if (/\.svg$/i.test(lower)) score -= 8
  if (/commons-logo|ambox|edit-clear/i.test(lower)) score -= 50
  return score
}

async function fetchSummaryMeta(title: string): Promise<WikiSummary | null> {
  try {
    const res = await fetch(`${WIKI_REST_SUMMARY}/${wikiSlug(title)}`)
    if (!res.ok) return null
    return (await res.json()) as WikiSummary
  } catch {
    return null
  }
}

async function wikiSearch(query: string, limit = 6): Promise<string[]> {
  const data = (await wikiQuery({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(limit),
  })) as { query?: { search?: { title: string }[] } }
  return (data.query?.search ?? []).map((h) => h.title)
}

/** Pick the Wikipedia page most likely to be the subject (character/species), not a film/game/book. */
async function findBestPageTitle(
  label: string,
  searchTerm: string,
  topicPrompt?: string,
): Promise<string | undefined> {
  const characterTopic = detectCharacterTopic(topicPrompt, label)
  const workTitle = extractWorkTitleFromTopic(topicPrompt)
  const ranked = new Map<string, number>()

  const bump = (title: string, score: number) => {
    if (isBadPageTitle(title)) return
    ranked.set(title, Math.max(ranked.get(title) ?? -999, score))
  }

  const normalizedTerm = normalizeCharacterSearchTerm(label, searchTerm, topicPrompt)

  for (const title of [normalizedTerm, searchTerm, label]) {
    if (!title) continue
    const meta = await fetchSummaryMeta(title)
    if (meta?.title && meta.type !== 'disambiguation') {
      bump(meta.title, scorePageTitle(meta.title, label, characterTopic, workTitle) + 8)
    }
  }

  const queries: string[] = []
  if (workTitle) {
    queries.push(`${label} ${workTitle}`, `${label} (${workTitle})`)
  }
  if (characterTopic) {
    queries.push(
      `${label} (character)`,
      `${label} (fictional character)`,
      `${label} (literary character)`,
    )
  }
  queries.push(
    `${label} (character)`,
    `${label} character`,
    `${label} Pokémon`,
    `${label} species`,
    normalizedTerm,
    searchTerm,
    label,
  )

  for (const q of [...new Set(queries.filter(Boolean))]) {
    for (const hit of await wikiSearch(q, 5)) {
      bump(hit, scorePageTitle(hit, label, characterTopic, workTitle))
    }
  }

  const sorted = [...ranked.entries()].sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0]
}

async function fetchImageThumbs(fileTitles: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (fileTitles.length === 0) return result

  for (let i = 0; i < fileTitles.length; i += 40) {
    const batch = fileTitles.slice(i, i + 40)
    const data = (await wikiQuery({
      action: 'query',
      titles: batch.join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(THUMB_WIDTH),
    })) as { query?: { pages?: Record<string, { title?: string; imageinfo?: { thumburl?: string }[] }> } }

    for (const page of Object.values(data.query?.pages ?? {})) {
      const thumb = page.imageinfo?.[0]?.thumburl
      if (thumb && page.title) result.set(page.title, thumb)
    }
  }
  return result
}

/** Pick the best on-page image (character art), not the lead poster/cover. */
async function fetchBestImageFromPage(pageTitle: string, label: string): Promise<string | undefined> {
  const data = (await wikiQuery({
    action: 'query',
    titles: pageTitle,
    redirects: '1',
    prop: 'images|pageprops',
    imlimit: '30',
  })) as { query?: { pages?: Record<string, WikiPageImage> } }

  const page = Object.values(data.query?.pages ?? {}).find((p) => !p.missing)
  if (!page) return undefined

  const fileTitles = (page.images ?? [])
    .map((img) => img.title)
    .filter((t) => t.startsWith('File:') && !/commons-logo|wikimedia|ambox|edit-|question_book/i.test(t))

  const scored: { file: string; score: number }[] = []
  for (const file of fileTitles) {
    const score = scoreImageFile(file, label)
    if (score > -10) scored.push({ file, score })
  }

  if (page.pageprops?.page_image) {
    const lead = `File:${page.pageprops.page_image}`
    if (!scored.some((s) => s.file === lead)) {
      scored.push({ file: lead, score: scoreImageFile(lead, label) })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const candidates = scored.slice(0, 8)
  if (candidates.length === 0) return undefined

  const thumbs = await fetchImageThumbs(candidates.map((c) => c.file))
  for (const { file } of candidates) {
    const url = thumbs.get(file)
    if (url) return url
  }

  return undefined
}

async function resolveOneImage(
  title: string,
  label: string,
  topicPrompt?: string,
): Promise<string | undefined> {
  const pageTitle = await findBestPageTitle(label, title, topicPrompt)
  if (!pageTitle) return undefined

  const fromPageImages = await fetchBestImageFromPage(pageTitle, label)
  if (fromPageImages) return fromPageImages

  const summary = await fetchSummaryMeta(pageTitle)
  if (summary?.thumbnail?.source && scoreImageFile(summary.thumbnail.source, label) > -5) {
    return summary.thumbnail.source
  }

  return undefined
}

/** Resolve Wikipedia page titles to thumbnail URLs. */
export async function resolveWikiImages(titles: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const unique = [...new Set(titles.filter(Boolean))]
  if (unique.length === 0) return result

  await mapPool(unique, RESOLVE_CONCURRENCY, async (title) => {
    const url = await resolveOneImage(title, title)
    if (url) result.set(title, url)
  })

  return result
}

/** Skip Wikipedia meta/list pages — poor tier-list candidates. */
function isRankableWikiTitle(title: string): boolean {
  const lower = title.toLowerCase()
  if (lower.startsWith('list of')) return false
  if (lower.includes('disambiguation')) return false
  if (lower.endsWith(' franchise')) return false
  if (lower.startsWith('category:')) return false
  if (lower.startsWith('template:')) return false
  if (lower.startsWith('file:')) return false
  return true
}

/** Search Wikipedia for pages matching a prompt (LLM-free fallback). */
export async function searchWikiItems(prompt: string, max = 30): Promise<WikiSearchResult[]> {
  const trimmed = prompt.trim()
  if (!trimmed) return []

  const categoryTitle = `Category:${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
  const categoryData = (await wikiQuery({
    action: 'query',
    generator: 'categorymembers',
    gcmtitle: categoryTitle,
    gcmlimit: String(Math.min(max * 2, 50)),
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: String(THUMB_WIDTH),
  })) as { query?: { pages?: Record<string, WikiPageImage> } }

  const categoryPages = categoryData.query?.pages
  if (categoryPages && Object.keys(categoryPages).length > 0) {
    return Object.values(categoryPages)
      .filter((p) => p.title && isRankableWikiTitle(p.title) && !isBadPageTitle(p.title))
      .slice(0, max)
      .map((p) => ({ label: p.title, wikiTitle: p.title }))
  }

  const hits = await wikiSearch(trimmed, max * 2)
  return hits
    .filter((t) => isRankableWikiTitle(t) && !isBadPageTitle(t))
    .slice(0, max)
    .map((title) => ({ label: title, wikiTitle: title }))
}

/** Attach Wikipedia thumbnails to label/searchTerm pairs. */
export async function enrichWithWikiImages(
  entries: { label: string; searchTerm: string }[],
  options?: { topicPrompt?: string; onProgress?: (done: number, total: number) => void },
): Promise<{ label: string; imageUrl?: string }[]> {
  if (entries.length === 0) return []

  const topicPrompt = options?.topicPrompt
  const total = entries.length
  let completed = 0

  const results = await mapPool(entries, RESOLVE_CONCURRENCY, async (entry) => {
    try {
      const rawTerm = entry.searchTerm || entry.label
      const searchTerm = normalizeCharacterSearchTerm(entry.label, rawTerm, topicPrompt)
      return {
        label: entry.label,
        imageUrl: await resolveOneImage(searchTerm, entry.label, topicPrompt),
      }
    } catch (error) {
      console.warn(`Wikipedia image lookup failed for "${entry.label}":`, error)
      return { label: entry.label, imageUrl: undefined }
    } finally {
      completed++
      options?.onProgress?.(completed, total)
    }
  })

  return results
}
