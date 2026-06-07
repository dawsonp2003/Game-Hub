import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRoom } from '../context/RoomContext'
import type { GameDef } from '../games/types'
import { MODE_LABELS, type GameMode } from '../lib/multiplayer/types'
import {
  loadGameProfile,
  modeDisplayLabel,
  sessionsForMode,
  computeGameStatDisplay,
  gameModeFromFavorite,
  type GameProfileData,
} from '../lib/stats'
import GameCover from '../components/GameCover'
import ComputerOptionsModal from '../components/ComputerOptionsModal'
import type { ComputerOptions } from '../lib/computer-options'
import {
  formatComputerOptionsSummary,
  loadSavedComputerOptions,
  resolveComputerOptions,
  saveComputerOptions,
} from '../lib/computer-options'
import './GameInfoPage.css'

interface GameInfoPageProps {
  game: GameDef
}

function pickDefaultMode(
  game: GameDef,
  onlineReady: boolean,
  favoriteMode: GameMode | null = null,
): GameMode {
  if (onlineReady && game.modes.includes('remote')) return 'remote'
  if (favoriteMode && game.modes.includes(favoriteMode)) return favoriteMode
  return game.modes[0]!
}

export default function GameInfoPage({ game }: GameInfoPageProps) {
  const navigate = useNavigate()
  const room = useRoom()
  const supportsRemote = game.modes.includes('remote')
  const onlineReady = room.isInRoom && room.isPlayReady && supportsRemote

  const [profile, setProfile] = useState<GameProfileData | null>(null)
  const favoriteApplied = useRef(false)

  const [selectedMode, setSelectedMode] = useState<GameMode>(() =>
    pickDefaultMode(game, false),
  )
  const [computerOptionsOpen, setComputerOptionsOpen] = useState(false)
  const [computerOptions, setComputerOptions] = useState<ComputerOptions>(() =>
    game.computerOptions
      ? resolveComputerOptions(game.computerOptions, loadSavedComputerOptions(game.id) ?? undefined)
      : {},
  )

  const onlineSelected = selectedMode === 'remote' && supportsRemote

  const computerOptionsSummary = useMemo(() => {
    if (!game.computerOptions) return ''
    return formatComputerOptionsSummary(game.computerOptions, computerOptions)
  }, [game.computerOptions, computerOptions])

  const primaryAction = useMemo(() => {
    if (onlineSelected) {
      if (!room.isInRoom) {
        return { label: 'Create a room', disabled: false }
      }
      if (!room.isPlayReady) {
        return { label: 'Not enough players', disabled: true }
      }
      if (room.role === 'guest') {
        return { label: 'Suggest to host', disabled: false }
      }
      return { label: 'Play', disabled: false }
    }
    return { label: 'Play', disabled: false }
  }, [
    onlineSelected,
    room.isInRoom,
    room.isPlayReady,
    room.role,
  ])

  useEffect(() => {
    favoriteApplied.current = false
  }, [game.id])

  useEffect(() => {
    if (!game.computerOptions) return
    setComputerOptions(
      resolveComputerOptions(game.computerOptions, loadSavedComputerOptions(game.id) ?? undefined),
    )
  }, [game.id, game.computerOptions])

  useEffect(() => {
    let active = true
    loadGameProfile(game.id, game.modes).then((data) => {
      if (!active) return
      setProfile(data)
      if (!favoriteApplied.current) {
        const favorite = gameModeFromFavorite(data.favoriteMode, game.modes) as GameMode | null
        setSelectedMode(pickDefaultMode(game, onlineReady, favorite))
        favoriteApplied.current = true
      }
    })
    return () => {
      active = false
    }
  }, [game.id, game.modes, onlineReady])

  const startPlay = (options?: ComputerOptions) => {
    navigate(`/play/${game.id}`, {
      state: { mode: selectedMode, computerOptions: options },
    })
  }

  const handlePlay = () => {
    if (onlineSelected) {
      if (!room.isInRoom) {
        room.setRoomPanelOpen(true)
        return
      }
      if (!room.isPlayReady) return
      if (room.role === 'guest') {
        room.suggestGame(game.id)
        return
      }
      room.launchGame(game.id)
      return
    }
    if (selectedMode === 'ai' && game.computerOptions) {
      startPlay(computerOptions)
      return
    }
    startPlay()
  }

  const handleComputerOptionsConfirm = (options: ComputerOptions) => {
    saveComputerOptions(game.id, options)
    setComputerOptions(options)
    setComputerOptionsOpen(false)
  }

  return (
    <div className="game-info">
      <header className="game-info__header">
        <button
          type="button"
          className="game-info__back btn-ghost"
          onClick={() => navigate('/')}
          aria-label="Back to menu"
        >
          ←
        </button>
        <h1 className="game-info__header-title">{game.name}</h1>
      </header>

      <div className="game-info__layout">
        <section className="game-info__main">
          <h2 className="game-info__name">{game.name}</h2>
          <p className="game-info__desc">{game.description}</p>

          <div className="game-info__howto">
            <h3 className="game-info__section-label">How to play</h3>
            <p className="game-info__howto-text">{game.howToPlay}</p>
          </div>

          <div className="game-info__modes" role="radiogroup" aria-label="Game mode">
            <span className="game-info__modes-label">Mode</span>
            {game.modes.map((m) => {
              const selected = selectedMode === m
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`game-info__mode-chip${selected ? ' game-info__mode-chip--selected' : ''}`}
                  onClick={() => setSelectedMode(m)}
                >
                  {MODE_LABELS[m]}
                </button>
              )
            })}
          </div>
          {selectedMode === 'ai' && game.computerOptions && (
            <button
              type="button"
              className="game-info__computer-settings"
              onClick={() => setComputerOptionsOpen(true)}
            >
              {computerOptionsSummary}
            </button>
          )}

          <button
            type="button"
            className="btn game-info__play"
            onClick={handlePlay}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </button>
        </section>

        <aside className="game-info__aside">
          <GameInfoAside game={game} selectedMode={selectedMode} profile={profile} />
        </aside>
      </div>

      {computerOptionsOpen && game.computerOptions && (
        <ComputerOptionsModal
          config={game.computerOptions}
          initialValues={computerOptions}
          onConfirm={handleComputerOptionsConfirm}
          onClose={() => setComputerOptionsOpen(false)}
        />
      )}
    </div>
  )
}

function RecentGamesPanel({ profile }: { profile: GameProfileData | null }) {
  const count = profile?.recentLabels.length ?? 0

  return (
    <details className="game-info__recent">
      <summary className="game-info__recent-summary">
        <span className="game-info__recent-summary-label">Recent games</span>
        {profile !== null && count > 0 && (
          <span className="game-info__recent-count">{count}</span>
        )}
      </summary>
      <div className="game-info__recent-body">
        {profile === null ? (
          <p className="game-info__muted">Loading…</p>
        ) : count === 0 ? (
          <p className="game-info__muted">Your last 20 sessions will show up here.</p>
        ) : (
          <ol className="game-info__recent-list">
            {profile.recentLabels.map((line, i) => (
              <li key={`${line}-${i}`}>{line}</li>
            ))}
          </ol>
        )}
      </div>
    </details>
  )
}

function GameInfoAside({
  game,
  selectedMode,
  profile,
}: {
  game: GameDef
  selectedMode: GameMode
  profile: GameProfileData | null
}) {
  const modeLabel = modeDisplayLabel(selectedMode)
  const modeEntries = profile ? sessionsForMode(profile.sessions, selectedMode) : []
  const statItems = profile ? computeGameStatDisplay(game.id, modeEntries) : []

  return (
    <>
      <GameCover game={game} />

      <div className="game-info__stats">
        <h3 className="game-info__stats-title">Your stats in {modeLabel}</h3>
        {profile === null ? (
          <p className="game-info__muted">Loading…</p>
        ) : statItems.length > 0 ? (
          <ul
            className={`game-info__stat-list${statItems.length > 2 ? ' game-info__stat-list--wide' : ''}`}
          >
            {statItems.map((item) => (
              <li key={item.label}>
                <span className="game-info__stat-value">{item.value}</span>
                <span className="game-info__stat-label">{item.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="game-info__muted">No games in {modeLabel} yet — hit Play to start!</p>
        )}
      </div>

      <RecentGamesPanel profile={profile} />
    </>
  )
}
