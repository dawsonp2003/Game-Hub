type Cell = 'X' | 'O' | null
type Player = 'X' | 'O'

export type TttDifficulty = 'easy' | 'medium' | 'hard'

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

function checkWinner(board: Cell[]): Player | 'draw' | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as Player
    }
  }
  if (board.every(Boolean)) return 'draw'
  return null
}

function emptyIndices(board: Cell[]): number[] {
  const out: number[] = []
  for (let i = 0; i < 9; i++) {
    if (!board[i]) out.push(i)
  }
  return out
}

function pickRandom(board: Cell[]): number {
  const legal = emptyIndices(board)
  return legal[Math.floor(Math.random() * legal.length)] ?? -1
}

function pickPerfect(board: Cell[], ai: Player): number {
  const opponent: Player = ai === 'X' ? 'O' : 'X'

  const minimax = (b: Cell[], isMax: boolean): number => {
    const w = checkWinner(b)
    if (w === ai) return 1
    if (w === opponent) return -1
    if (w === 'draw') return 0

    const player = isMax ? ai : opponent
    let best = isMax ? -Infinity : Infinity

    for (let i = 0; i < 9; i++) {
      if (b[i]) continue
      const next = [...b] as Cell[]
      next[i] = player
      const score = minimax(next, !isMax)
      best = isMax ? Math.max(best, score) : Math.min(best, score)
    }
    return best
  }

  let bestScore = -Infinity
  let move = -1
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue
    const next = [...board] as Cell[]
    next[i] = ai
    const score = minimax(next, false)
    if (score > bestScore) {
      bestScore = score
      move = i
    }
  }
  return move
}

function pickMedium(board: Cell[], ai: Player): number {
  const opponent: Player = ai === 'X' ? 'O' : 'X'
  const legal = emptyIndices(board)

  for (const i of legal) {
    const next = [...board] as Cell[]
    next[i] = ai
    if (checkWinner(next) === ai) return i
  }

  for (const i of legal) {
    const next = [...board] as Cell[]
    next[i] = opponent
    if (checkWinner(next) === opponent) return i
  }

  const preferred = [4, 0, 2, 6, 8, 1, 3, 5, 7].filter((i) => !board[i])
  if (preferred.length > 0) {
    return preferred[Math.floor(Math.random() * preferred.length)]!
  }
  return pickRandom(board)
}

function pickEasy(board: Cell[], ai: Player): number {
  const opponent: Player = ai === 'X' ? 'O' : 'X'
  const legal = emptyIndices(board)

  // Occasionally block or win so it does not feel completely broken.
  if (Math.random() < 0.35) {
    for (const i of legal) {
      const next = [...board] as Cell[]
      next[i] = ai
      if (checkWinner(next) === ai) return i
    }
    for (const i of legal) {
      const next = [...board] as Cell[]
      next[i] = opponent
      if (checkWinner(next) === opponent) return i
    }
  }

  return pickRandom(board)
}

export function pickAiMove(board: Cell[], ai: Player, difficulty: TttDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return pickEasy(board, ai)
    case 'medium':
      return pickMedium(board, ai)
    case 'hard':
    default:
      return pickPerfect(board, ai)
  }
}

export function parseTttDifficulty(value: string | undefined): TttDifficulty {
  if (value === 'easy' || value === 'medium' || value === 'hard') return value
  return 'hard'
}
