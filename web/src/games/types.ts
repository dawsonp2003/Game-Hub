import type { ComponentType } from 'react'
import type { ComputerOptions, ComputerOptionsConfig } from '../lib/computer-options'
import type { GameMode } from '../lib/multiplayer/types'
import type { MultiplayerSession } from '../lib/multiplayer/session'

export type { GameMode }

export type GameCategory = 'word' | 'logic' | 'board-2p' | 'arcade' | 'card'

export type GameStatus = 'live' | 'wip'

export interface GameProps {
  mode: GameMode
  session: MultiplayerSession | null
  peerAway?: boolean
  onExit: () => void
  /** Options chosen in the computer setup modal when mode is `ai`. */
  computerOptions?: ComputerOptions
  /** Async saved match id when mode is `async`. */
  asyncMatchId?: string
}

export interface GameDef {
  id: string
  name: string
  description: string
  /** Short rules / how to play copy for the game info page. */
  howToPlay: string
  icon: string
  /** Cover art URL, e.g. `/games/word-guess.png` in `web/public/games/`. Falls back to icon. */
  image?: string
  category: GameCategory
  modes: GameMode[]
  /** Popup fields shown before starting vs computer (difficulty, word length, etc.). */
  computerOptions?: ComputerOptionsConfig
  status: GameStatus
  load: () => Promise<{ default: ComponentType<GameProps> }>
}

export const CATEGORY_LABELS: Record<GameCategory, string> = {
  word: 'Word & Letter',
  logic: 'Logic & Puzzles',
  'board-2p': 'Strategy Games',
  arcade: 'Arcade',
  card: 'Card & Casual',
}
