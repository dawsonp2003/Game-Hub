import { getSignalingHttpUrl, wakeSignalingServer } from '../multiplayer/signaling'
import { buildImageSearchQuery } from './image-context'
import { enrichWithWikiImages } from './wikipedia'

export interface ImageEnrichEntry {
  label: string
  searchTerm?: string
  imageQuery?: string
  description?: string
}

interface ServerImageResult {
  label: string
  imageUrl?: string
  query?: string
}

interface ServerImageResponse {
  items?: ServerImageResult[]
  configured?: boolean
  authFailed?: boolean
}

async function fetchImagesFromServer(
  entries: ImageEnrichEntry[],
  topicPrompt?: string,
): Promise<{ images: Map<string, string>; authFailed: boolean; configured: boolean }> {
  await wakeSignalingServer()
  const base = getSignalingHttpUrl()

  const res = await fetch(`${base}/api/tier-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topicPrompt,
      items: entries.map((entry) => ({
        label: entry.label,
        imageQuery: entry.imageQuery ?? buildImageSearchQuery(entry.label, topicPrompt),
        searchTerm: entry.searchTerm,
      })),
    }),
  })

  if (res.status === 503) {
    const data = (await res.json().catch(() => ({}))) as ServerImageResponse
    if (data.configured === false) {
      return { images: new Map(), authFailed: false, configured: false }
    }
  }

  if (!res.ok) {
    throw new Error(`Image search failed (${res.status})`)
  }

  const data = (await res.json()) as ServerImageResponse
  const images = new Map<string, string>()
  for (const item of data.items ?? []) {
    if (item.imageUrl) images.set(item.label, item.imageUrl)
  }

  return {
    images,
    authFailed: data.authFailed === true,
    configured: data.configured !== false,
  }
}

/** Resolve card images via Google-style search (server), with Wikipedia fallback. */
export async function enrichWithImages(
  entries: ImageEnrichEntry[],
  options?: {
    topicPrompt?: string
    onProgress?: (done: number, total: number) => void
    onStatus?: (message: string, detail?: string) => void
  },
): Promise<{ label: string; imageUrl?: string; description?: string }[]> {
  if (entries.length === 0) return []

  const topicPrompt = options?.topicPrompt
  const total = entries.length
  const resolved = new Map<string, string>()

  let serverResult: { images: Map<string, string>; authFailed: boolean; configured: boolean } | null =
    null

  try {
    serverResult = await fetchImagesFromServer(entries, topicPrompt)
  } catch (err) {
    console.warn('tier-list image search failed, falling back to Wikipedia:', err)
    options?.onStatus?.('Image search failed — using Wikipedia…')
  }

  if (serverResult?.configured) {
    for (const [label, url] of serverResult.images) {
      resolved.set(label, url)
    }

    if (serverResult.authFailed) {
      options?.onStatus?.(
        'Image search unavailable — using Wikipedia…',
        'Check SERPER_API_KEY at serper.dev/api-key',
      )
    }
  } else if (!serverResult) {
    options?.onStatus?.('Using Wikipedia for images…')
  }

  const missing = entries.filter((entry) => !resolved.has(entry.label))

  if (missing.length > 0) {
    const wikiOffset = resolved.size
    if (missing.length === total) {
      options?.onStatus?.('Finding images on Wikipedia…', `0 / ${total}`)
    }

    const wikiResults = await enrichWithWikiImages(
      missing.map((entry) => ({
        label: entry.label,
        searchTerm: entry.searchTerm ?? entry.label,
      })),
      {
        topicPrompt,
        onProgress: (done) => {
          options?.onProgress?.(wikiOffset + done, total)
        },
      },
    )

    for (const item of wikiResults) {
      if (item.imageUrl) resolved.set(item.label, item.imageUrl)
    }
  } else {
    options?.onProgress?.(total, total)
  }

  return entries.map((entry) => ({
    label: entry.label,
    imageUrl: resolved.get(entry.label),
    description: entry.description,
  }))
}
