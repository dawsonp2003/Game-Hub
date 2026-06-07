import { useEffect, useRef } from 'react'
import { useIsMobileViewport, usePinchPanZoom } from '../../hooks/usePinchPanZoom'
import {
  boardLabel,
  cellIndex,
  getLegalMoves,
  isMiniClosed,
  type Player,
  type UtttMove,
  type UtttState,
} from './uttt-engine'
import './UltimateTicTacToe.css'

interface UltimateTicTacToeBoardProps {
  state: UtttState
  canPlay: boolean
  lastMove?: UtttMove | null
  onCellClick: (move: UtttMove) => void
}

export default function UltimateTicTacToeBoard({
  state,
  canPlay,
  lastMove,
  onCellClick,
}: UltimateTicTacToeBoardProps) {
  const miniRefs = useRef<(HTMLDivElement | null)[]>([])
  const isMobile = useIsMobileViewport()
  const { viewportRef, contentRef, transform } = usePinchPanZoom(isMobile)

  const activeBoard =
    state.forcedBoard !== null && !isMiniClosed(state.miniOutcomes[state.forcedBoard]!)
      ? state.forcedBoard
      : null

  useEffect(() => {
    if (isMobile || state.macroWinner || activeBoard === null) return
    const el = miniRefs.current[activeBoard]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [activeBoard, state.macroWinner, isMobile])

  const isBoardPlayable = (board: number) => {
    if (!canPlay || state.macroWinner) return false
    if (isMiniClosed(state.miniOutcomes[board]!)) return false
    if (state.forcedBoard === null) return true
    return state.forcedBoard === board
  }

  const boardGrid = (
    <div
      className={`uttt__macro ${state.forcedBoard === null && canPlay && !state.macroWinner ? 'uttt__macro--free' : ''}`}
      role="grid"
      aria-label="Ultimate tic tac toe board"
    >
      {Array.from({ length: 9 }, (_, board) => {
        const outcome = state.miniOutcomes[board]!
        const closed = isMiniClosed(outcome)
        const playable = isBoardPlayable(board)
        const isTarget = activeBoard === board

        return (
          <div
            key={board}
            ref={(el) => {
              miniRefs.current[board] = el
            }}
            className={[
              'uttt__mini',
              playable ? 'uttt__mini--active' : '',
              !playable && !closed && canPlay ? 'uttt__mini--dimmed' : '',
              closed ? 'uttt__mini--closed' : '',
              isTarget ? 'uttt__mini--target' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`${boardLabel(board)} mini board${outcome ? `, won by ${outcome}` : ''}`}
          >
            {outcome === 'X' && (
              <div className="uttt__won-overlay uttt__won-overlay--x" aria-hidden>
                X
              </div>
            )}
            {outcome === 'O' && (
              <div className="uttt__won-overlay uttt__won-overlay--o" aria-hidden>
                O
              </div>
            )}
            {outcome === 'draw' && (
              <div className="uttt__won-overlay uttt__won-overlay--draw" aria-hidden>
                =
              </div>
            )}

            {Array.from({ length: 9 }, (_, cell) => {
              const idx = cellIndex(board, cell)
              const value = state.cells[idx]
              const isLast = lastMove?.board === board && lastMove?.cell === cell

              return (
                <button
                  key={cell}
                  type="button"
                  className={[
                    'uttt__cell',
                    value === 'X' ? 'uttt__cell--x' : '',
                    value === 'O' ? 'uttt__cell--o' : '',
                    isLast ? 'uttt__cell--last' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={!playable || !!value}
                  onClick={() => onCellClick({ board, cell })}
                  aria-label={
                    value
                      ? `${value} in ${boardLabel(board)} cell ${cell + 1}`
                      : `Empty cell ${cell + 1} in ${boardLabel(board)}`
                  }
                >
                  {value}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )

  return (
    <div
      className={`uttt__viewport${isMobile ? ' uttt__viewport--mobile' : ''}`}
      ref={viewportRef}
    >
      {isMobile ? (
        <div
          ref={contentRef}
          className="uttt__zoom-layer"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          {boardGrid}
        </div>
      ) : (
        boardGrid
      )}
    </div>
  )
}

export function statusForState(
  state: UtttState,
  opts: {
    canPlay: boolean
    mySymbol?: Player
    isRemote?: boolean
    peerAway?: boolean
  },
): string {
  if (opts.peerAway) return 'Friend stepped away — board preserved.'
  if (state.macroWinner === 'draw') return "It's a draw!"
  if (state.macroWinner) {
    if (opts.mySymbol) {
      return state.macroWinner === opts.mySymbol ? 'You win!' : 'You lose!'
    }
    return `${state.macroWinner} wins!`
  }
  if (!opts.canPlay && opts.isRemote) {
    return "Opponent's turn"
  }
  if (state.forcedBoard === null) {
    const n = getLegalMoves(state).length
    return `Free move — play in any open board (${n} spots)`
  }
  return `Play in the ${boardLabel(state.forcedBoard)} board`
}
