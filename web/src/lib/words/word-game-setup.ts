import type { GameMode } from '../multiplayer/types'
import type { SessionRole } from '../multiplayer/session'

export type WordGameRole = 'setter' | 'guesser'

/** Host sets the secret word; guest guesses (remote). Player 1 sets in pass-and-play. */
export function wordGameSetterRole(mode: GameMode, sessionRole: SessionRole | null): WordGameRole {
  if (mode === 'pass-and-play') return 'setter'
  if (mode === 'remote') return sessionRole === 'host' ? 'setter' : 'guesser'
  return 'setter'
}

export function needsWordSetup(mode: GameMode): boolean {
  return mode === 'pass-and-play' || mode === 'remote'
}

export function normalizeSecretWord(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

export function isValidSecretWord(word: string, minLen = 2, maxLen = 16): boolean {
  return word.length >= minLen && word.length <= maxLen
}

export function setterLabel(mode: GameMode, sessionRole: SessionRole | null): string {
  if (mode === 'pass-and-play') return 'Player 1 — enter a word for Player 2'
  if (sessionRole === 'host') return 'Enter a word for your friend to guess'
  return 'Waiting for host to set a word…'
}

export function guesserLabel(mode: GameMode): string {
  if (mode === 'pass-and-play') return 'Player 2 — guess the word'
  return 'Guess the word your friend chose'
}
