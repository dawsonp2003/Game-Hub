import { useMemo, useState } from 'react'
import type { GameCategory } from '../games/types'
import { CATEGORY_LABELS } from '../games/types'
import { getLiveGames } from '../games/registry'
import { useRoom } from '../context/RoomContext'
import GameCard from './GameCard'
import RoomPanel from './RoomPanel'
import './MenuGrid.css'

const ALL = 'all' as const
type Filter = typeof ALL | GameCategory

export default function MenuGrid() {
  const room = useRoom()
  const games = getLiveGames()
  const [filter, setFilter] = useState<Filter>(ALL)

  const categories = useMemo(() => {
    const set = new Set(games.map((g) => g.category))
    return Array.from(set) as GameCategory[]
  }, [games])

  const filtered = useMemo(() => {
    if (filter === ALL) return games
    return games.filter((g) => g.category === filter)
  }, [games, filter])

  const showExpandedRoom = room.roomPanelOpen

  return (
    <div className="menu-grid">
      <header className="menu-grid__header">
        <h1 className="menu-grid__title">Game Arcade</h1>
        <p className="menu-grid__subtitle">Pick a game to play</p>
      </header>

      {room.isInRoom && !room.roomPanelOpen && (
        <button
          type="button"
          className="menu-grid__room-chip"
          onClick={() => room.setRoomPanelOpen(true)}
        >
          <span className="menu-grid__room-chip-code">{room.roomCode}</span>
          <span className={`menu-grid__room-chip-status menu-grid__room-chip-status--${room.status}`}>
            {room.status === 'connected' ? 'Connected' : room.statusMessage || 'In room'}
          </span>
        </button>
      )}

      {!room.isInRoom && !room.roomPanelOpen && (
        <button
          type="button"
          className={`btn menu-grid__friend-btn ${room.loading && room.pendingAction !== 'restore' ? 'menu-grid__friend-btn--loading' : ''}`}
          onClick={() => room.setRoomPanelOpen(true)}
          disabled={room.loading && room.pendingAction !== 'restore'}
        >
          {room.loading && room.pendingAction !== 'restore' ? 'Connecting…' : '👥 Play with a friend'}
        </button>
      )}

      {showExpandedRoom && <RoomPanel onClose={() => room.setRoomPanelOpen(false)} />}

      <div className="menu-grid__filters" role="tablist">
        <button
          type="button"
          role="tab"
          className={`menu-grid__filter ${filter === ALL ? 'active' : ''}`}
          onClick={() => setFilter(ALL)}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            className={`menu-grid__filter ${filter === cat ? 'active' : ''}`}
            onClick={() => setFilter(cat)}
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
        <p className="menu-grid__empty">No games in this category yet.</p>
      )}
    </div>
  )
}
