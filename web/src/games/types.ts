import type { ComponentType } from 'react'
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
}

export interface GameDef {
  id: string
  name: string
  description: string
  icon: string
  category: GameCategory
  modes: GameMode[]
  status: GameStatus
  load: () => Promise<{ default: ComponentType<GameProps> }>
}

export const CATEGORY_LABELS: Record<GameCategory, string> = {
  word: 'Word & Letter',
  logic: 'Logic & Puzzles',
  'board-2p': 'Board Games',
  arcade: 'Arcade',
  card: 'Card & Casual',
}
