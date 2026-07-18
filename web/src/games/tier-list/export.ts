import type { TierListState } from './types'

const CARD_SIZE = 72
const LABEL_WIDTH = 48
const ROW_HEIGHT = 80
const PADDING = 8
const FONT = 'bold 14px system-ui, sans-serif'

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export async function exportTierListPng(state: TierListState): Promise<Blob | null> {
  const rows = state.tiers
  const maxItemsInRow = Math.max(
    1,
    ...rows.map((t) => t.itemIds.length),
    state.unranked.length > 0 ? Math.min(state.unranked.length, 12) : 0,
  )
  const rowCount = rows.length + (state.unranked.length > 0 ? 1 : 0)
  const width = LABEL_WIDTH + PADDING * 2 + maxItemsInRow * (CARD_SIZE + PADDING) + PADDING
  const height = PADDING + rowCount * (ROW_HEIGHT + PADDING) + PADDING + 40

  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(2, 2)
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillText(state.title, PADDING, 24)

  let y = 40

  const drawRow = async (label: string, color: string, itemIds: string[]) => {
    ctx.fillStyle = color
    ctx.fillRect(PADDING, y, LABEL_WIDTH, ROW_HEIGHT)
    ctx.fillStyle = '#000'
    ctx.font = FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, PADDING + LABEL_WIDTH / 2, y + ROW_HEIGHT / 2)

    let x = PADDING + LABEL_WIDTH + PADDING
    ctx.fillStyle = '#2a2a3e'
    ctx.fillRect(PADDING + LABEL_WIDTH, y, width - LABEL_WIDTH - PADDING, ROW_HEIGHT)

    for (const id of itemIds) {
      const item = state.items[id]
      if (!item) continue

      if (item.imageUrl) {
        const img = await loadImage(item.imageUrl)
        if (img) {
          ctx.drawImage(img, x, y + 4, CARD_SIZE, CARD_SIZE - 8)
        } else {
          drawTextCard(ctx, item.label, x, y)
        }
      } else {
        drawTextCard(ctx, item.label, x, y)
      }
      x += CARD_SIZE + PADDING
    }

    y += ROW_HEIGHT + PADDING
  }

  for (const tier of rows) {
    await drawRow(tier.label, tier.color, tier.itemIds)
  }

  if (state.unranked.length > 0) {
    await drawRow('?', '#444', state.unranked)
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

function drawTextCard(ctx: CanvasRenderingContext2D, label: string, x: number, y: number) {
  ctx.fillStyle = '#3a3a50'
  ctx.fillRect(x, y + 4, CARD_SIZE, CARD_SIZE - 8)
  ctx.fillStyle = '#fff'
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const text = label.length > 10 ? `${label.slice(0, 9)}…` : label
  ctx.fillText(text, x + CARD_SIZE / 2, y + ROW_HEIGHT / 2)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
