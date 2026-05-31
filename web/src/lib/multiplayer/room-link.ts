const ROOM_PARAM = 'room'

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.replace(/\D/g, '').slice(0, 6)
  return code.length === 6 ? code : null
}

export function parseRoomCodeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const room = params.get(ROOM_PARAM)
  return room ? normalizeRoomCode(room) : null
}

export function parseRoomCodeFromUrl(href = window.location.href): string | null {
  try {
    return parseRoomCodeFromSearch(new URL(href).search)
  } catch {
    return null
  }
}

export function buildRoomUrl(code: string, baseUrl = window.location.origin + window.location.pathname): string {
  const url = new URL(baseUrl, window.location.origin)
  url.searchParams.set(ROOM_PARAM, normalizeRoomCode(code) ?? code)
  return url.toString()
}

export function setRoomUrlParam(code: string | null): void {
  const url = new URL(window.location.href)
  if (code) url.searchParams.set(ROOM_PARAM, normalizeRoomCode(code) ?? code)
  else url.searchParams.delete(ROOM_PARAM)
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', next)
}

export function getRoomSharePayload(code: string): { title: string; text: string; url: string } {
  const normalized = normalizeRoomCode(code) ?? code
  const url = buildRoomUrl(normalized)
  return {
    title: 'Join my Game Arcade room',
    text: `Join my Game Arcade room! Code: ${normalized}`,
    url,
  }
}

export async function copyRoomLink(code: string): Promise<void> {
  const url = buildRoomUrl(code)

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = url
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

/** Opens the native share sheet (Web Share API). */
export async function shareRoomLink(code: string): Promise<void> {
  if (typeof navigator.share !== 'function') {
    throw new Error('Share is not supported in this browser. Use Copy link instead.')
  }

  const { title, text, url } = getRoomSharePayload(code)
  await navigator.share({ title, text, url })
}

export function canUseNativeShare(): boolean {
  return typeof navigator.share === 'function'
}
