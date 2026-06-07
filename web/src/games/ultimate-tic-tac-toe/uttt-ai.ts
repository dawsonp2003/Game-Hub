import {
  applyMove,
  getLegalMoves,
  pickAiMoveHard,
  scoreMoveHeuristic,
  type Player,
  type UtttMove,
  type UtttState,
} from './uttt-engine'

const WIN = 100_000
const LOSE = -100_000
const DRAW = 0

const FULL_TIME_MS = 8_000
const FULL_MAX_DEPTH = 10
const HALF_TIME_MS = 4_000
const HALF_MAX_DEPTH = 5

/** AI moves 1–5 use Hard; 6–15 ramp depth/time; 16+ full expert search. */
const FAST_AI_PLIES = 5
const RAMP_AI_PLIES = 15

/** Only trim wide trees below the root. */
const NODE_BEAM = 18
const NODE_BEAM_TRIGGER = 16

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

type TTFlag = 'exact' | 'lower' | 'upper'

interface TTEntry {
  depth: number
  score: number
  flag: TTFlag
}

interface SearchBudget {
  timeMs: number
  maxDepth: number
}

let transposition = new Map<string, TTEntry>()

function opponentOf(player: Player): Player {
  return player === 'X' ? 'O' : 'X'
}

function aiPliesPlayed(state: UtttState, ai: Player): number {
  return state.cells.filter((c) => c === ai).length
}

/** Depth and time scale from half → full over AI plies 6–15. */
function expertSearchBudget(state: UtttState, ai: Player): SearchBudget | 'hard' {
  const plies = aiPliesPlayed(state, ai)

  if (plies < FAST_AI_PLIES) return 'hard'

  if (plies >= RAMP_AI_PLIES) {
    return { timeMs: FULL_TIME_MS, maxDepth: FULL_MAX_DEPTH }
  }

  const t = (plies - FAST_AI_PLIES) / (RAMP_AI_PLIES - FAST_AI_PLIES)
  return {
    timeMs: Math.round(HALF_TIME_MS + t * (FULL_TIME_MS - HALF_TIME_MS)),
    maxDepth: Math.round(HALF_MAX_DEPTH + t * (FULL_MAX_DEPTH - HALF_MAX_DEPTH)),
  }
}

function moveKey(m: UtttMove): string {
  return `${m.board}:${m.cell}`
}

function stateKey(state: UtttState): string {
  const cells = state.cells.map((c) => (c === 'X' ? 'X' : c === 'O' ? 'O' : '.')).join('')
  const minis = state.miniOutcomes.map((o) => o ?? '.').join('')
  return `${cells}|${minis}|${state.forcedBoard ?? 'n'}|${state.current}`
}

function storeTT(key: string, entry: TTEntry): void {
  transposition.set(key, entry)
  if (transposition.size > 160_000) {
    let removed = 0
    for (const k of transposition.keys()) {
      transposition.delete(k)
      if (++removed >= 40_000) break
    }
  }
}

function macroThreatScore(state: UtttState, player: Player): number {
  const opp = opponentOf(player)
  let score = 0

  for (const [a, b, c] of WIN_LINES) {
    const line = [state.miniOutcomes[a], state.miniOutcomes[b], state.miniOutcomes[c]]
    let mine = 0
    let theirs = 0
    let open = 0
    for (const cell of line) {
      if (cell === player) mine++
      else if (cell === opp) theirs++
      else open++
    }
    if (theirs > 0) continue
    if (mine === 2 && open === 1) score += 10
    else if (mine === 1 && open === 2) score += 3
  }

  return score
}

function evaluateState(state: UtttState, ai: Player): number {
  const opp = opponentOf(ai)

  if (state.macroWinner === ai) return WIN
  if (state.macroWinner === opp) return LOSE
  if (state.macroWinner === 'draw') return DRAW

  let score = 0

  for (const outcome of state.miniOutcomes) {
    if (outcome === ai) score += 120
    else if (outcome === opp) score -= 120
    else if (outcome === 'draw') score -= 8
  }

  score += macroThreatScore(state, ai) * 14
  score -= macroThreatScore(state, opp) * 14

  const moves = getLegalMoves(state)
  for (const m of moves) {
    const next = applyMove(state, m)
    if (next.macroWinner === ai) score += 40
    if (next.macroWinner === opp) score -= 35
  }

  return score
}

function isImmediateWin(state: UtttState, move: UtttMove, player: Player): boolean {
  return applyMove(state, move).macroWinner === player
}

function isTacticalPosition(state: UtttState): boolean {
  if (state.macroWinner) return false
  const player = state.current
  const opp = opponentOf(player)
  for (const m of getLegalMoves(state)) {
    const next = applyMove(state, m)
    if (next.macroWinner === player || next.macroWinner === opp) return true
  }
  return false
}

function orderMoves(state: UtttState, moves: UtttMove[], ai: Player, scoreHint?: Map<string, number>): UtttMove[] {
  const opp = opponentOf(ai)
  const player = state.current

  return [...moves].sort((a, b) => {
    const hintA = scoreHint?.get(moveKey(a))
    const hintB = scoreHint?.get(moveKey(b))
    if (hintA !== undefined && hintB !== undefined && hintA !== hintB) return hintB - hintA

    const scoreMove = (m: UtttMove) => {
      if (isImmediateWin(state, m, player)) return 2_000_000
      const next = applyMove(state, m)
      if (next.macroWinner === opp) return -2_000_000

      let s = scoreMoveHeuristic(state, m, player)

      for (const reply of getLegalMoves(next)) {
        if (isImmediateWin(next, reply, opp)) {
          s -= 150_000
          break
        }
      }

      if (m.cell === 4) s += 6
      if (m.board === 4) s += 4
      return s
    }
    return scoreMove(b) - scoreMove(a)
  })
}

function selectMoves(
  state: UtttState,
  moves: UtttMove[],
  ai: Player,
  depth: number,
  scoreHint?: Map<string, number>,
): UtttMove[] {
  const player = state.current
  const wins = moves.filter((m) => isImmediateWin(state, m, player))
  const rest = moves.filter((m) => !wins.some((w) => w.board === m.board && w.cell === m.cell))

  if (depth < 2 || rest.length <= NODE_BEAM_TRIGGER) {
    return orderMoves(state, [...wins, ...rest], ai, scoreHint)
  }

  const ordered = orderMoves(state, rest, ai, scoreHint)
  const beam = ordered.slice(0, Math.max(NODE_BEAM - wins.length, 8))
  return [...wins, ...beam]
}

function negamax(
  state: UtttState,
  depth: number,
  alpha: number,
  beta: number,
  ai: Player,
  deadline: number,
  scoreHint?: Map<string, number>,
): number {
  if (Date.now() >= deadline) return evaluateState(state, ai)

  const key = stateKey(state)
  const cached = transposition.get(key)
  if (cached && cached.depth >= depth) {
    if (cached.flag === 'exact') return cached.score
    if (cached.flag === 'lower') alpha = Math.max(alpha, cached.score)
    else if (cached.flag === 'upper') beta = Math.min(beta, cached.score)
    if (alpha >= beta) return cached.score
  }

  if (state.macroWinner) return evaluateState(state, ai)

  let searchDepth = depth
  if (searchDepth === 0 && isTacticalPosition(state)) {
    searchDepth = 2
  }

  if (searchDepth === 0) return evaluateState(state, ai)

  const legal = getLegalMoves(state)
  if (legal.length === 0) return evaluateState(state, ai)

  const moves = selectMoves(state, legal, ai, searchDepth, scoreHint)

  let best = -Infinity
  let flag: TTFlag = 'upper'

  for (const move of moves) {
    const child = applyMove(state, move)
    const score = -negamax(child, searchDepth - 1, -beta, -alpha, ai, deadline, scoreHint)

    if (score > best) best = score

    if (score > alpha) {
      alpha = score
      flag = 'exact'
    }
    if (alpha >= beta) {
      flag = 'lower'
      break
    }
  }

  if (best === -Infinity) best = evaluateState(state, ai)

  storeTT(key, { depth: searchDepth, score: best, flag })
  return best
}

function pickAiMoveDeep(state: UtttState, ai: Player, budget: SearchBudget): UtttMove | null {
  const legal = getLegalMoves(state)
  if (legal.length === 0) return null

  for (const move of legal) {
    if (isImmediateWin(state, move, ai)) return move
  }

  transposition.clear()
  const deadline = Date.now() + budget.timeMs
  const rootScores = new Map<string, number>()

  let candidates = orderMoves(state, legal, ai)
  let bestMove = candidates[0]!
  let completedDepth = 0

  for (let depth = 1; depth <= budget.maxDepth; depth++) {
    if (Date.now() >= deadline) break

    candidates = orderMoves(state, legal, ai, rootScores)

    let alpha = -Infinity
    let beta = Infinity
    let depthBestMove = bestMove
    let depthBestScore = -Infinity
    let allResolved = true

    for (const move of candidates) {
      if (Date.now() >= deadline) {
        allResolved = false
        break
      }

      const child = applyMove(state, move)
      const score = -negamax(child, depth - 1, -beta, -alpha, ai, deadline, rootScores)

      rootScores.set(moveKey(move), score)

      if (score > depthBestScore) {
        depthBestScore = score
        depthBestMove = move
      }
      alpha = Math.max(alpha, score)
    }

    if (allResolved) {
      bestMove = depthBestMove
      completedDepth = depth
    } else {
      break
    }
  }

  return completedDepth > 0 ? bestMove : (candidates[0] ?? legal[0]!)
}

/** True when Expert will run iterative deepening (not the opening Hard pass). */
export function expertUsesDeepSearch(state: UtttState, ai: Player): boolean {
  return expertSearchBudget(state, ai) !== 'hard'
}

/**
 * Expert: fast Hard search early, ramp depth/time over the next 10 AI moves, then full deep search.
 */
export function pickAiMoveExpert(state: UtttState, ai: Player): UtttMove | null {
  const profile = expertSearchBudget(state, ai)

  if (profile === 'hard') {
    return pickAiMoveHard(state, ai)
  }

  return pickAiMoveDeep(state, ai, profile)
}
