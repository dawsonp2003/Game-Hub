const STORAGE_PREFIX = 'game-arcade-remote-opening:'

/** Who leads as X (host) vs O (guest) in the next remote game for this party + title. */
export function getRemoteOpening(gameId: string, roomCode: string | null): 'X' | 'O' {
  if (!roomCode) return 'X'
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${gameId}:${roomCode}`)
    if (raw === 'X' || raw === 'O') return raw
  } catch {
    /* ignore */
  }
  return 'X'
}

export function rotateRemoteOpening(
  gameId: string,
  roomCode: string | null,
  whoWentFirst: 'X' | 'O',
): void {
  if (!roomCode) return
  const next = whoWentFirst === 'X' ? 'O' : 'X'
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${gameId}:${roomCode}`, next)
  } catch {
    /* ignore */
  }
}

export function nextRemoteOpening(whoWentFirst: 'X' | 'O'): 'X' | 'O' {
  return whoWentFirst === 'X' ? 'O' : 'X'
}
