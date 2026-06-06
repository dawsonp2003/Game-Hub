export type Player = 'X' | 'O'
export type Cell = Player | null
export type MiniOutcome = Player | 'draw' | null

export interface UtttState {
  cells: Cell[]
  miniOutcomes: MiniOutcome[]
  macroWinner: Player | 'draw' | null
  /** Next move must be in this mini board (0–8), or any open board if null. */
  forcedBoard: number | null
  current: Player
}

export interface UtttMove {
  board: number
  cell: number
}

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

export function cellIndex(board: number, cell: number): number {
  return board * 9 + cell
}

export function boardFromGlobal(index: number): { board: number; cell: number } {
  return { board: Math.floor(index / 9), cell: index % 9 }
}

function lineWinner(cells: Cell[]): Player | null {
  for (const [a, b, c] of WIN_LINES) {
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
      return cells[a]!
    }
  }
  return null
}

export function getMiniCells(state: UtttState, board: number): Cell[] {
  const start = board * 9
  return state.cells.slice(start, start + 9)
}

export function isMiniClosed(outcome: MiniOutcome): boolean {
  return outcome !== null
}

export function createInitialState(first: Player = 'X'): UtttState {
  return {
    cells: Array(81).fill(null),
    miniOutcomes: Array(9).fill(null),
    macroWinner: null,
    forcedBoard: null,
    current: first,
  }
}

function resolveMiniOutcome(cells: Cell[]): MiniOutcome {
  const won = lineWinner(cells)
  if (won) return won
  if (cells.every(Boolean)) return 'draw'
  return null
}

function resolveMacroWinner(miniOutcomes: MiniOutcome[]): Player | null {
  const macro = miniOutcomes.map((o) => (o === 'X' || o === 'O' ? o : null))
  return lineWinner(macro)
}

export function getLegalMoves(state: UtttState): UtttMove[] {
  if (state.macroWinner) return []

  const moves: UtttMove[] = []
  const boardsToPlay =
    state.forcedBoard !== null && !isMiniClosed(state.miniOutcomes[state.forcedBoard]!)
      ? [state.forcedBoard]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((b) => !isMiniClosed(state.miniOutcomes[b]!))

  for (const board of boardsToPlay) {
    const mini = getMiniCells(state, board)
    mini.forEach((c, cell) => {
      if (!c) moves.push({ board, cell })
    })
  }
  return moves
}

export function applyMove(state: UtttState, move: UtttMove): UtttState {
  const idx = cellIndex(move.board, move.cell)
  if (state.cells[idx] || state.macroWinner) return state

  const legal = getLegalMoves(state)
  if (!legal.some((m) => m.board === move.board && m.cell === move.cell)) return state

  const cells = [...state.cells]
  cells[idx] = state.current

  const miniOutcomes = [...state.miniOutcomes]
  const miniCells = cells.slice(move.board * 9, move.board * 9 + 9)
  miniOutcomes[move.board] = resolveMiniOutcome(miniCells)

  let forcedBoard: number | null = move.cell
  if (isMiniClosed(miniOutcomes[move.cell]!)) {
    forcedBoard = null
  }

  const macroWinner = resolveMacroWinner(miniOutcomes)
  const allClosed = miniOutcomes.every(isMiniClosed)
  const macroOutcome: Player | 'draw' | null = macroWinner ?? (allClosed ? 'draw' : null)

  return {
    cells,
    miniOutcomes,
    macroWinner: macroOutcome,
    forcedBoard,
    current: state.current === 'X' ? 'O' : 'X',
  }
}

export function boardLabel(board: number): string {
  const labels = [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ]
  return labels[board] ?? `board ${board + 1}`
}

/** Shallow AI: win/block locally & on macro, then heuristic. */
export type UtttDifficulty = 'easy' | 'normal' | 'hard'

function evaluateMove(state: UtttState, m: UtttMove, ai: Player): number {
  const opponent: Player = ai === 'X' ? 'O' : 'X'
  const next = applyMove(state, m)
  let score = 0
  if (next.macroWinner === ai) score += 1000
  if (next.macroWinner === opponent) score -= 1000

  const miniAfter = next.miniOutcomes[m.board]
  if (miniAfter === ai) score += 120
  if (miniAfter === opponent) score += 80

  const sentBoard = m.cell
  const sentOutcome = next.miniOutcomes[sentBoard]
  if (sentOutcome === opponent) score -= 40
  if (sentOutcome === ai) score += 25

  if (m.cell === 4) score += 8
  if (m.board === 4) score += 4

  const oppMoves = getLegalMoves(next)
  for (const om of oppMoves) {
    const afterOpp = applyMove(next, om)
    if (afterOpp.macroWinner === opponent) score -= 200
    if (afterOpp.miniOutcomes[om.board] === opponent) score -= 15
  }

  return score
}

function pickAiMoveNormal(state: UtttState, ai: Player): UtttMove | null {
  const moves = getLegalMoves(state)
  if (moves.length === 0) return null

  let best = moves[0]!
  let bestScore = -Infinity
  for (const m of moves) {
    const s = evaluateMove(state, m, ai) + Math.random() * 0.5
    if (s > bestScore) {
      bestScore = s
      best = m
    }
  }
  return best
}

function pickAiMoveHard(state: UtttState, ai: Player): UtttMove | null {
  const moves = getLegalMoves(state)
  if (moves.length === 0) return null
  const opponent: Player = ai === 'X' ? 'O' : 'X'

  for (const m of moves) {
    if (applyMove(state, m).macroWinner === ai) return m
  }

  let best = moves[0]!
  let bestScore = -Infinity

  for (const m of moves) {
    const next = applyMove(state, m)
    if (next.macroWinner === ai) return m

    const replies = getLegalMoves(next)
    let worstReply = -Infinity

    if (replies.length === 0) {
      worstReply = 0
    } else {
      for (const r of replies) {
        const after = applyMove(next, r)
        if (after.macroWinner === opponent) {
          worstReply = 1000
          break
        }
        worstReply = Math.max(worstReply, evaluateMove(next, r, opponent))
      }
    }

    const score = evaluateMove(state, m, ai) - worstReply
    if (score > bestScore) {
      bestScore = score
      best = m
    }
  }

  return best
}

export function parseUtttDifficulty(value: string | undefined): UtttDifficulty {
  if (value === 'easy' || value === 'normal' || value === 'hard') return value
  return 'normal'
}

export function pickAiMove(
  state: UtttState,
  ai: Player,
  difficulty: UtttDifficulty = 'normal',
): UtttMove | null {
  const moves = getLegalMoves(state)
  if (moves.length === 0) return null

  switch (difficulty) {
    case 'easy':
      return moves[Math.floor(Math.random() * moves.length)]!
    case 'hard':
      return pickAiMoveHard(state, ai)
    case 'normal':
    default:
      return pickAiMoveNormal(state, ai)
  }
}
