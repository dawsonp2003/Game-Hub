import { useEffect, useMemo, useState } from 'react'
import type { GameCategory } from '../games/types'
import { CATEGORY_LABELS } from '../games/types'
import { getLiveGames, isMultiplayerGame } from '../games/registry'
import { useAuth } from '../context/AuthContext'
import { useRoom } from '../context/RoomContext'
import { fetchPlayCounts } from '../lib/stats'
import GameCard from './GameCard'
import RoomMenuButton from './RoomMenuButton'
import RoomSuggestionChip from './RoomSuggestionChip'
import AccountButton from './AccountButton'
import './MenuGrid.css'

const ALL = 'all' as const
const MULTIPLAYER = 'multiplayer' as const
type Filter = typeof ALL | typeof MULTIPLAYER | GameCategory

const LIVE_GAMES = getLiveGames()

function sortByPlays<T extends { id: string }>(
  items: T[],
  playCounts: Record<string, number>,
  tieOrder: T[],
): T[] {
  return [...items].sort((a, b) => {
    const diff = (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0)
    if (diff !== 0) return diff
    return tieOrder.indexOf(a) - tieOrder.indexOf(b)
  })
}

export default function MenuGrid() {
  const auth = useAuth()
  const room = useRoom()
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let active = true
    fetchPlayCounts().then((counts) => {
      if (active) setPlayCounts(counts)
    })
    return () => {
      active = false
    }
  }, [auth.user?.id])

  const games = useMemo(
    () => sortByPlays(LIVE_GAMES, playCounts, LIVE_GAMES),
    [playCounts],
  )

  const [filter, setFilter] = useState<Filter>(ALL)

  useEffect(() => {
    if (room.isInRoom) {
      setFilter(MULTIPLAYER)
    } else {
      setFilter((current) => (current === MULTIPLAYER ? ALL : current))
    }
  }, [room.isInRoom])

  const categories = useMemo(() => {
    const set = new Set(games.map((g) => g.category))
    return Array.from(set) as GameCategory[]
  }, [games])

  const filtered = useMemo(() => {
    if (filter === ALL) return games
    if (filter === MULTIPLAYER) return games.filter(isMultiplayerGame)
    return games.filter((g) => g.category === filter)
  }, [games, filter])

  return (
    <div className="menu-grid">
      <header className="menu-grid__header">
        <div className="menu-grid__header-row">
          <div className="menu-grid__header-start">
            <RoomMenuButton />
          </div>
          <h1 className="menu-grid__title">Game Arcade</h1>
          <div className="menu-grid__header-end">
            <AccountButton />
          </div>
        </div>
        <RoomSuggestionChip />
      </header>

      <div className="menu-grid__filters" role="tablist">
        <button
          type="button"
          role="tab"
          className={`menu-grid__filter ${filter === ALL ? 'active' : ''}`}
          onClick={() => setFilter(ALL)}
          aria-selected={filter === ALL}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          className={`menu-grid__filter ${filter === MULTIPLAYER ? 'active' : ''}`}
          onClick={() => setFilter(MULTIPLAYER)}
          aria-selected={filter === MULTIPLAYER}
        >
          Multiplayer
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            className={`menu-grid__filter ${filter === cat ? 'active' : ''}`}
            onClick={() => setFilter(cat)}
            aria-selected={filter === cat}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="menu-grid__list">
        {filtered.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="menu-grid__empty">
          {filter === MULTIPLAYER ? 'No multiplayer games yet.' : 'No games in this category yet.'}
        </p>
      )}
    </div>
  )
}
