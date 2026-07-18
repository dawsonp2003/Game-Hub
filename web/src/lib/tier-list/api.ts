import { getSignalingHttpUrl, wakeSignalingServer } from '../multiplayer/signaling'
import {
  type GenerateStatusCallback,
  TierGenerateError,
  sleep,
} from './generate-status'
import { enrichWithImages } from './images'
import { searchWikiItems } from './wikipedia'

export interface PromptItemResult {
  label: string
  searchTerm: string
  imageQuery?: string
  description?: string
}

export interface FetchPromptItemsOptions {
  onStatus?: GenerateStatusCallback
}

export interface FetchPromptItemsResult {
  items: { label: string; imageUrl?: string; description?: string }[]
  itemSource: 'llm' | 'wikipedia' | 'none'
  usedWikiFallback: boolean
  warning?: string
}

const DEFAULT_MAX = 30
const CLIENT_MAX_ATTEMPTS = 3
const RETRYABLE_HTTP = new Set([429, 502, 503])

function statusMessageForHttp(code: number): string {
  if (code === 429) return 'Too many requests — waiting before retry…'
  if (code === 503) return 'AI servers are busy — retrying…'
  if (code === 502) return 'Generation failed — retrying…'
  return `Request failed (${code}) — retrying…`
}

async function fetchItemsFromApi(
  prompt: string,
  max: number,
  onStatus?: GenerateStatusCallback,
): Promise<{ items: PromptItemResult[]; usedLlm: boolean; warning?: string }> {
  onStatus?.({ message: 'Connecting to server…' })
  await wakeSignalingServer()

  const base = getSignalingHttpUrl()
  let lastError = 'Request failed'

  for (let attempt = 1; attempt <= CLIENT_MAX_ATTEMPTS; attempt++) {
    if (attempt === 1) {
      onStatus?.({
        message: 'Sending request…',
        detail: 'Asking AI to pick items for your list',
      })
    } else {
      onStatus?.({
        message: `Retrying request (${attempt}/${CLIENT_MAX_ATTEMPTS})…`,
        detail: lastError,
      })
      await sleep(1200 * attempt)
    }

    try {
      const res = await fetch(`${base}/api/tier-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, max }),
      })

      if (res.ok) {
        const data = (await res.json()) as {
          items?: PromptItemResult[]
          source?: string
          model?: string
        }
        if (Array.isArray(data.items) && data.items.length > 0) {
          onStatus?.({
            message: 'Items received',
            detail: `${data.items.length} items from AI${data.model ? ` (${data.model})` : ''}`,
          })
          return {
            items: data.items.map((item) => ({
              label: item.label,
              searchTerm: item.searchTerm ?? item.label,
              imageQuery: item.imageQuery,
              description: item.description,
            })),
            usedLlm: data.source === 'llm',
          }
        }
        lastError = 'AI returned no items'
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          fallback?: boolean
        }
        lastError = data.error ?? statusMessageForHttp(res.status)

        if (data.fallback) {
          return { items: [], usedLlm: false, warning: lastError }
        }

        if (RETRYABLE_HTTP.has(res.status) && attempt < CLIENT_MAX_ATTEMPTS) {
          onStatus?.({
            message: statusMessageForHttp(res.status),
            detail: `Attempt ${attempt} of ${CLIENT_MAX_ATTEMPTS}`,
          })
          continue
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error'
      if (attempt < CLIENT_MAX_ATTEMPTS) {
        onStatus?.({
          message: 'Connection failed — retrying…',
          detail: `Attempt ${attempt} of ${CLIENT_MAX_ATTEMPTS}`,
        })
        continue
      }
    }
  }

  return { items: [], usedLlm: false, warning: lastError }
}

export async function fetchPromptItems(
  prompt: string,
  max = DEFAULT_MAX,
  options?: FetchPromptItemsOptions,
): Promise<FetchPromptItemsResult> {
  const trimmed = prompt.trim()
  if (!trimmed) {
    return { items: [], itemSource: 'none', usedWikiFallback: false }
  }

  const onStatus = options?.onStatus
  let items: PromptItemResult[] = []
  let usedWikiFallback = false
  let warning: string | undefined

  const apiResult = await fetchItemsFromApi(trimmed, max, onStatus)
  items = apiResult.items
  warning = apiResult.warning

  if (items.length === 0) {
    usedWikiFallback = true
    onStatus?.({
      message: 'Searching Wikipedia…',
      detail: apiResult.usedLlm
        ? undefined
        : warning ?? 'AI unavailable — using Wikipedia instead',
    })
    const wikiHits = await searchWikiItems(trimmed, max)
    items = wikiHits.map((h) => ({ label: h.label, searchTerm: h.wikiTitle }))
    if (items.length > 0) {
      onStatus?.({
        message: 'Found items on Wikipedia',
        detail: `${items.length} items`,
      })
    }
  }

  if (items.length === 0) {
    throw new TierGenerateError(
      'no items',
      'No items found for this prompt. Try something more specific (e.g. "Harry Potter characters" or "Mario characters").',
    )
  }

  onStatus?.({
    message: 'Finding images…',
    detail: `0 / ${items.length}`,
  })

  const withImages = await enrichWithImages(
    items.map((item) => ({
      label: item.label,
      searchTerm: item.searchTerm,
      imageQuery: item.imageQuery,
      description: item.description,
    })),
    {
      topicPrompt: trimmed,
      onStatus: (message, detail) => onStatus?.({ message, detail }),
      onProgress: (done, total) => {
        onStatus?.({
          message: 'Finding images…',
          detail: `${done} / ${total}`,
        })
      },
    },
  )

  const imageCount = withImages.filter((i) => i.imageUrl).length
  onStatus?.({
    message: 'Finishing up…',
    detail: `${withImages.length} cards · ${imageCount} with images`,
  })

  return {
    items: withImages,
    itemSource: usedWikiFallback ? 'wikipedia' : apiResult.usedLlm ? 'llm' : 'wikipedia',
    usedWikiFallback,
    warning: usedWikiFallback ? warning : undefined,
  }
}

/** Load images for preset/manual item lists. */
export async function fetchImagesForEntries(
  entries: { label: string; searchTerm: string; imageQuery?: string; description?: string }[],
  options?: { topicPrompt?: string; onStatus?: GenerateStatusCallback },
): Promise<{ label: string; imageUrl?: string; description?: string }[]> {
  if (entries.length === 0) return []

  options?.onStatus?.({
    message: 'Finding images…',
    detail: `0 / ${entries.length}`,
  })

  return enrichWithImages(
    entries.map((entry) => ({
      label: entry.label,
      searchTerm: entry.searchTerm,
      imageQuery: entry.imageQuery,
      description: entry.description,
    })),
    {
      topicPrompt: options?.topicPrompt,
      onStatus: (message, detail) => options?.onStatus?.({ message, detail }),
      onProgress: (done, total) => {
        options?.onStatus?.({
          message: 'Finding images…',
          detail: `${done} / ${total}`,
        })
      },
    },
  )
}
