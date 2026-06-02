import { FIVE_LETTER_SET, FIVE_LETTER_WORDS } from './five-letter'
import { FIVE_LETTER_GUESS_SET, FIVE_LETTER_GUESS_WORDS } from './word-guess-guesses'
import { COMMON_WORDS, COMMON_WORD_SET } from './common'
import { LADDER_DICTIONARY_SET } from './ladder-dictionary'
import { LADDER_PUZZLES, LADDER_WORD_SET, type LadderPuzzle } from './ladders'

export {
  FIVE_LETTER_WORDS,
  FIVE_LETTER_SET,
  FIVE_LETTER_GUESS_WORDS,
  FIVE_LETTER_GUESS_SET,
  COMMON_WORDS,
  COMMON_WORD_SET,
  LADDER_PUZZLES,
  LADDER_WORD_SET,
  LADDER_DICTIONARY_SET,
}
export * from './word-game-setup'
export type { LadderPuzzle }

export type LetterResult = 'correct' | 'present' | 'absent'

export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

export function pickRandomFiveLetterWord(): string {
  return pickRandom(FIVE_LETTER_WORDS)
}

export function isValidFiveLetterGuess(word: string): boolean {
  return FIVE_LETTER_GUESS_SET.has(word.toUpperCase())
}

export function pickRandomHangmanWord(): string {
  const pool = COMMON_WORDS.filter((w) => w.length >= 4 && w.length <= 8)
  return pickRandom(pool).toUpperCase()
}

export function pickRandomAnagramWord(minLen = 4, maxLen = 7): string {
  const pool = COMMON_WORDS.filter((w) => w.length >= minLen && w.length <= maxLen)
  return pickRandom(pool).toUpperCase()
}

export function pickRandomLadderPuzzle(): LadderPuzzle {
  const puzzle = pickRandom(LADDER_PUZZLES)
  return { start: puzzle.start.toUpperCase(), end: puzzle.end.toUpperCase(), minSteps: puzzle.minSteps }
}

export function diffByOneLetter(a: string, b: string): boolean {
  const x = a.toUpperCase()
  const y = b.toUpperCase()
  if (x.length !== y.length) return false
  let diffs = 0
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) diffs++
    if (diffs > 1) return false
  }
  return diffs === 1
}

export function isValidLadderStep(from: string, to: string, targetLen: number, allowAnyWord = false): boolean {
  const word = to.toUpperCase()
  if (word.length !== targetLen) return false
  if (!diffByOneLetter(from, word)) return false
  if (allowAnyWord) return true
  return LADDER_WORD_SET.has(word)
}

/** Wordle-style feedback for a guess against the answer. */
export function scoreWordGuess(guess: string, answer: string): LetterResult[] {
  const g = guess.toUpperCase()
  const a = answer.toUpperCase()
  const result: LetterResult[] = Array(g.length).fill('absent')
  const answerCounts = new Map<string, number>()

  for (const ch of a) {
    answerCounts.set(ch, (answerCounts.get(ch) ?? 0) + 1)
  }

  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) {
      result[i] = 'correct'
      answerCounts.set(g[i]!, (answerCounts.get(g[i]!) ?? 0) - 1)
    }
  }

  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'correct') continue
    const ch = g[i]!
    const remaining = answerCounts.get(ch) ?? 0
    if (remaining > 0) {
      result[i] = 'present'
      answerCounts.set(ch, remaining - 1)
    }
  }

  return result
}

export interface WordFindPuzzle {
  grid: string[][]
  words: string[]
}

const FILLER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function randomLetter(): string {
  return FILLER[Math.floor(Math.random() * FILLER.length)]!
}

/** Build a small word-search grid hiding the given words. */
export function buildWordFindPuzzle(size: number, words: string[]): WordFindPuzzle {
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null))
  const upper = words.map((w) => w.toUpperCase())

  for (const word of upper) {
    let placed = false
    for (let attempt = 0; attempt < 100 && !placed; attempt++) {
      const horizontal = Math.random() > 0.5
      const r = Math.floor(Math.random() * size)
      const c = Math.floor(Math.random() * size)
      const dr = horizontal ? 0 : 1
      const dc = horizontal ? 1 : 0
      const endR = r + dr * (word.length - 1)
      const endC = c + dc * (word.length - 1)
      if (endR >= size || endC >= size) continue

      let fits = true
      for (let i = 0; i < word.length; i++) {
        const cell = grid[r + dr * i]![c + dc * i]
        if (cell !== null && cell !== word[i]) {
          fits = false
          break
        }
      }
      if (!fits) continue

      for (let i = 0; i < word.length; i++) {
        grid[r + dr * i]![c + dc * i] = word[i]!
      }
      placed = true
    }
  }

  const filled = grid.map((row) => row.map((cell) => cell ?? randomLetter()))
  return { grid: filled, words: upper }
}

export function pickWordFindPuzzle(): WordFindPuzzle {
  const candidates = COMMON_WORDS.filter((w) => w.length >= 4 && w.length <= 5)
  const words = shuffle(candidates).slice(0, 4).map((w) => w.toUpperCase())
  return buildWordFindPuzzle(5, words)
}
