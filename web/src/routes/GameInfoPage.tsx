import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAsyncNotificationsContext } from '../context/AsyncNotificationsContext'
import type { GameDef } from '../games/types'
import {
  defaultOnlineMode,
  MODE_LABELS,
  visibleModes,
  type GameMode,
} from '../lib/multiplayer/types'
import {
  loadGameProfile,
  modeDisplayLabel,
  sessionsForMode,
  computeGameStatDisplay,
  gameModeFromFavorite,
  formatHistoryRow,
  type GameProfileData,
} from '../lib/stats'
import GameCover from '../components/GameCover'
import AsyncMatchPanel from '../components/AsyncMatchPanel'
import AccountModal from '../components/AccountModal'
import ComputerOptionsModal from '../components/ComputerOptionsModal'
import SaveDataBanner from '../components/SaveDataBanner'
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

function pickDefaultMode(game: GameDef, favoriteMode: GameMode | null = null): GameMode {
  const online = defaultOnlineMode(game.modes)
  if (online) return online
  if (favoriteMode && game.modes.includes(favoriteMode)) return favoriteMode
  return visibleModes(game.modes)[0]!
}

type GameInfoLocationState = { preferAsync?: boolean }

export default function GameInfoPage({ game }: GameInfoPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const preferAsync = (location.state as GameInfoLocationState | null)?.preferAsync === true
  const auth = useAuth()
  const { turnByGame } = useAsyncNotificationsContext()
  const hasAsyncTurn = (turnByGame[game.id] ?? 0) > 0
  const displayModes = visibleModes(game.modes)
  const supportsAsync = game.modes.includes('async')
  const [accountOpen, setAccountOpen] = useState(false)

  const [profile, setProfile] = useState<GameProfileData | null>(null)
  const favoriteApplied = useRef(false)

  const [selectedMode, setSelectedMode] = useState<GameMode>(() => pickDefaultMode(game))
  const [computerOptionsOpen, setComputerOptionsOpen] = useState(false)
  const [computerOptions, setComputerOptions] = useState<ComputerOptions>(() =>
    game.computerOptions
      ? resolveComputerOptions(game.computerOptions, loadSavedComputerOptions(game.id) ?? undefined)
      : {},
  )

  const asyncSelected = selectedMode === 'async' && supportsAsync

  const computerOptionsSummary = useMemo(() => {
    if (!game.computerOptions) return ''
    return formatComputerOptionsSummary(game.computerOptions, computerOptions)
  }, [game.computerOptions, computerOptions])

  const openAccount = () => {
    auth.openAccountCreation()
    setAccountOpen(true)
  }

  useEffect(() => {
    if (auth.accountCreationRequested) setAccountOpen(true)
  }, [auth.accountCreationRequested])

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
        if ((preferAsync || hasAsyncTurn) && supportsAsync) {
          setSelectedMode('async')
        } else {
          setSelectedMode(pickDefaultMode(game, favorite))
        }
        favoriteApplied.current = true
      }
    })
    return () => {
      active = false
    }
  }, [game.id, game.modes, preferAsync, supportsAsync, hasAsyncTurn])

  const startPlay = (options?: ComputerOptions) => {
    navigate(`/play/${game.id}`, {
      state: { mode: selectedMode, computerOptions: options },
    })
  }

  const handlePlay = () => {
    if (asyncSelected) return
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
            {displayModes.map((m) => {
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

          {!asyncSelected && (
            <button type="button" className="btn game-info__play" onClick={handlePlay}>
              Play
            </button>
          )}

          {asyncSelected && <AsyncMatchPanel gameId={game.id} onNeedSignIn={openAccount} />}
        </section>

        <aside className="game-info__aside">
          <GameInfoAside
            game={game}
            selectedMode={selectedMode}
            profile={profile}
            onCreateAccount={openAccount}
            showSaveBanner={auth.isAnonymous}
          />
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

      {accountOpen && (
        <AccountModal
          onClose={() => {
            setAccountOpen(false)
            auth.clearAccountCreationRequest()
          }}
        />
      )}
    </div>
  )
}

function RecentGamesPanel({
  gameId,
  profile,
  showSaveBanner,
  onCreateAccount,
}: {
  gameId: string
  profile: GameProfileData | null
  showSaveBanner: boolean
  onCreateAccount: () => void
}) {
  const count = profile?.recent.length ?? 0

  return (
    <details className="game-info__recent">
      <summary className="game-info__recent-summary">
        <span className="game-info__recent-summary-label">Recent games</span>
        {profile !== null && count > 0 && (
          <span className="game-info__recent-count">{count}</span>
        )}
      </summary>
      <div className="game-info__recent-body">
        {showSaveBanner && (
          <SaveDataBanner compact onCreateAccount={onCreateAccount} />
        )}
        {profile === null ? (
          <p className="game-info__muted">Loading…</p>
        ) : count === 0 ? (
          <p className="game-info__muted">Your last 20 sessions will show up here.</p>
        ) : (
          <div className="game-info__recent-table-wrap">
            <table className="game-info__recent-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {profile.recent.map((entry, i) => {
                  const row = formatHistoryRow(entry, gameId)
                  return (
                    <tr key={`${entry.playedAt}-${i}`}>
                      <td>{row.date}</td>
                      <td>{row.mode}</td>
                      <td
                        className={
                          entry.result === 'win'
                            ? 'game-info__recent-result--win'
                            : entry.result === 'loss'
                              ? 'game-info__recent-result--loss'
                              : undefined
                        }
                      >
                        {row.result}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  )
}

function GameInfoAside({
  game,
  selectedMode,
  profile,
  onCreateAccount,
  showSaveBanner,
}: {
  game: GameDef
  selectedMode: GameMode
  profile: GameProfileData | null
  onCreateAccount: () => void
  showSaveBanner: boolean
}) {
  const modeLabel = modeDisplayLabel(selectedMode)
  const modeEntries = profile ? sessionsForMode(profile.sessions, selectedMode) : []
  const statItems = profile ? computeGameStatDisplay(game.id, modeEntries) : []

  return (
    <>
      <GameCover game={game} />

      {showSaveBanner && <SaveDataBanner onCreateAccount={onCreateAccount} />}

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

      <RecentGamesPanel
        gameId={game.id}
        profile={profile}
        showSaveBanner={showSaveBanner}
        onCreateAccount={onCreateAccount}
      />
    </>
  )
}
