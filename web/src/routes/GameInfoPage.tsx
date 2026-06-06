import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRoom } from '../context/RoomContext'
import type { GameDef } from '../games/types'
import { MODE_HINTS, MODE_LABELS, type GameMode } from '../lib/multiplayer/types'
import {
  loadGameProfile,
  modeDisplayLabel,
  sessionsForMode,
  computeSessionStats,
  gameModeFromFavorite,
  type GameProfileData,
} from '../lib/stats'
import GameCover from '../components/GameCover'
import './GameInfoPage.css'

interface GameInfoPageProps {
  game: GameDef
}

function pickDefaultMode(
  game: GameDef,
  disabledModes: GameMode[],
  inRoomRemote: boolean,
  favoriteMode: GameMode | null = null,
): GameMode {
  if (inRoomRemote && game.modes.includes('remote')) return 'remote'
  if (favoriteMode && !disabledModes.includes(favoriteMode)) return favoriteMode
  return game.modes.find((m) => !disabledModes.includes(m)) ?? game.modes[0]!
}

export default function GameInfoPage({ game }: GameInfoPageProps) {
  const navigate = useNavigate()
  const room = useRoom()
  const supportsRemote = game.modes.includes('remote')
  const inRoomRemote = room.isInRoom && room.isPlayReady && supportsRemote

  const disabledModes = useMemo(() => {
    const disabled: GameMode[] = []
    if (supportsRemote && !room.isPlayReady) disabled.push('remote')
    return disabled
  }, [supportsRemote, room.isPlayReady])

  const [profile, setProfile] = useState<GameProfileData | null>(null)
  const favoriteApplied = useRef(false)

  const [selectedMode, setSelectedMode] = useState<GameMode>(() =>
    pickDefaultMode(game, disabledModes, inRoomRemote),
  )

  useEffect(() => {
    favoriteApplied.current = false
  }, [game.id])

  useEffect(() => {
    let active = true
    loadGameProfile(game.id, game.modes).then((data) => {
      if (!active) return
      setProfile(data)
      if (!favoriteApplied.current) {
        const favorite = gameModeFromFavorite(data.favoriteMode, game.modes) as GameMode | null
        setSelectedMode(pickDefaultMode(game, disabledModes, inRoomRemote, favorite))
        favoriteApplied.current = true
      }
    })
    return () => {
      active = false
    }
  }, [game.id, game.modes, disabledModes, inRoomRemote])

  useEffect(() => {
    if (disabledModes.includes(selectedMode)) {
      const favorite = profile
        ? (gameModeFromFavorite(profile.favoriteMode, game.modes) as GameMode | null)
        : null
      setSelectedMode(pickDefaultMode(game, disabledModes, inRoomRemote, favorite))
    }
  }, [disabledModes, selectedMode, game, inRoomRemote, profile])

  const handlePlay = () => {
    if (inRoomRemote) {
      if (room.role === 'host') {
        room.launchGame(game.id)
        return
      }
      if (room.role === 'guest') {
        room.suggestGame(game.id)
        return
      }
    }
    navigate(`/play/${game.id}`, { state: { mode: selectedMode } })
  }

  const playLabel =
    inRoomRemote && room.role === 'guest'
      ? 'Suggest to host'
      : inRoomRemote && room.role === 'host'
        ? 'Play with room'
        : 'Play'

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
              const disabled = disabledModes.includes(m)
              const selected = selectedMode === m
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`game-info__mode-chip${selected ? ' game-info__mode-chip--selected' : ''}`}
                  onClick={() => setSelectedMode(m)}
                  disabled={disabled}
                  title={disabled ? MODE_HINTS[m] : undefined}
                >
                  {MODE_LABELS[m]}
                </button>
              )
            })}
          </div>
          {supportsRemote && !room.isPlayReady && (
            <p className="game-info__mode-hint">Join a room from the home page to play online.</p>
          )}

          <button type="button" className="btn game-info__play" onClick={handlePlay}>
            {playLabel}
          </button>
        </section>

        <aside className="game-info__aside">
          <GameInfoAside game={game} selectedMode={selectedMode} profile={profile} />
        </aside>
      </div>
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
  const modeStats = profile
    ? computeSessionStats(sessionsForMode(profile.sessions, selectedMode))
    : null

  return (
    <>
      <GameCover game={game} />

      <div className="game-info__stats">
        <h3 className="game-info__stats-title">Your stats in {modeLabel}</h3>
        {profile === null ? (
          <p className="game-info__muted">Loading…</p>
        ) : modeStats && modeStats.plays > 0 ? (
          <ul className="game-info__stat-list">
            <li>
              <span className="game-info__stat-value">{modeStats.plays}</span>
              <span className="game-info__stat-label">Games played</span>
            </li>
            <li>
              <span className="game-info__stat-value">{modeStats.wins}</span>
              <span className="game-info__stat-label">Wins</span>
            </li>
          </ul>
        ) : (
          <p className="game-info__muted">No games in {modeLabel} yet — hit Play to start!</p>
        )}
      </div>

      <RecentGamesPanel profile={profile} />
    </>
  )
}
