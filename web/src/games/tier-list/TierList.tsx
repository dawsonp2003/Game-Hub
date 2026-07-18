import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getLocalPlayerId } from '../../lib/auth/local-player'
import { fetchImagesForEntries, fetchPromptItems } from '../../lib/tier-list/api'
import {
  type GenerateStatus,
  TierGenerateError,
} from '../../lib/tier-list/generate-status'
import {
  deleteSavedTierList,
  listSavedTierLists,
  loadSavedTierList,
  saveTierList,
  type SavedTierListMeta,
} from '../../lib/tier-list/storage'
import type { GameProps } from '../types'
import { buildItemsFromEntries, createEmptyState } from './defaults'
import { downloadBlob, exportTierListPng } from './export'
import ManualEditor from './ManualEditor'
import StartModal from './StartModal'
import TierBoard from './TierBoard'
import { TIER_PRESETS } from './presets'
import { resetAllToUnranked } from './drag-utils'
import type { TierListState } from './types'
import { useTierListHistory } from './useTierListHistory'
import './tier-list.css'

export default function TierList({ onExit }: GameProps) {
  const auth = useAuth()
  const playerId = getLocalPlayerId(auth.user?.id)

  const {
    state,
    canUndo,
    canRedo,
    replaceState,
    commitState,
    previewState,
    undo,
    redo,
  } = useTierListHistory(null)

  const [showStart, setShowStart] = useState(true)
  const [showManual, setShowManual] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('Loading…')
  const [loadingDetail, setLoadingDetail] = useState('')
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [savedLists, setSavedLists] = useState<SavedTierListMeta[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshSaved = useCallback(() => {
    setSavedLists(listSavedTierLists(playerId))
  }, [playerId])

  useEffect(() => {
    refreshSaved()
  }, [refreshSaved])

  useEffect(() => {
    if (state) setTitleDraft(state.title)
  }, [state?.id, state?.title])

  const scheduleSave = useCallback(
    (next: TierListState) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTierList(playerId, next)
        refreshSaved()
      }, 600)
    },
    [playerId, refreshSaved],
  )

  const beginWithState = useCallback(
    (next: TierListState) => {
      replaceState(next)
      setShowStart(false)
      setShowManual(false)
      saveTierList(playerId, next)
      refreshSaved()
    },
    [playerId, refreshSaved, replaceState],
  )

  const handleCommit = useCallback(
    (next: TierListState, before?: TierListState) => {
      const committed = { ...next, updatedAt: Date.now() }
      commitState(committed, before)
      scheduleSave(committed)
    },
    [commitState, scheduleSave],
  )

  const handlePreview = useCallback(
    (next: TierListState) => {
      previewState(next)
    },
    [previewState],
  )

  useEffect(() => {
    if (state?.updatedAt) scheduleSave(state)
  }, [state?.updatedAt, scheduleSave])

  const reportGenerateStatus = useCallback((status: GenerateStatus) => {
    setLoadingLabel(status.message)
    setLoadingDetail(status.detail ?? '')
  }, [])

  const handlePrompt = useCallback(
    async (prompt: string) => {
      setLoading(true)
      setLoadingError(null)
      setLoadingLabel('Starting…')
      setLoadingDetail('')
      try {
        const result = await fetchPromptItems(prompt, 30, { onStatus: reportGenerateStatus })
        const base = createEmptyState(prompt)
        const built = buildItemsFromEntries(result.items, 'prompt')
        beginWithState({
          ...base,
          ...built,
        })
      } catch (err) {
        const message =
          err instanceof TierGenerateError
            ? err.userMessage
            : err instanceof Error
              ? err.message
              : 'Something went wrong. Please try again.'
        setLoadingError(message)
      } finally {
        setLoading(false)
      }
    },
    [beginWithState, reportGenerateStatus],
  )

  const handlePreset = useCallback(
    async (presetId: string) => {
      const preset = TIER_PRESETS.find((p) => p.id === presetId)
      if (!preset) return

      setLoading(true)
      setLoadingError(null)
      setLoadingLabel('Loading preset…')
      setLoadingDetail('')
      try {
        const entries = await fetchImagesForEntries(
          preset.items.map((i) => ({ label: i.label, searchTerm: i.wikiTitle })),
          { topicPrompt: preset.title, onStatus: reportGenerateStatus },
        )
        const base = createEmptyState(preset.title)
        const built = buildItemsFromEntries(entries, 'preset')
        beginWithState({ ...base, ...built })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not load preset images. Please try again.'
        setLoadingError(message)
      } finally {
        setLoading(false)
      }
    },
    [beginWithState, reportGenerateStatus],
  )

  const handleManualDone = useCallback(
    (items: { label: string; imageUrl?: string }[]) => {
      const base = createEmptyState('My Tier List')
      const built = buildItemsFromEntries(items, 'manual')
      beginWithState({ ...base, ...built })
    },
    [beginWithState],
  )

  const handleLoadSaved = useCallback(
    (id: string) => {
      const saved = loadSavedTierList(playerId, id)
      if (saved) beginWithState(saved)
    },
    [playerId, beginWithState],
  )

  const handleDeleteSaved = useCallback(
    (id: string) => {
      deleteSavedTierList(playerId, id)
      refreshSaved()
    },
    [playerId, refreshSaved],
  )

  const handleExport = useCallback(async () => {
    if (!state) return
    setLoading(true)
    setLoadingLabel('Creating image…')
    try {
      const blob = await exportTierListPng(state)
      if (blob) {
        const safeName = state.title.replace(/[^\w\s-]/g, '').trim() || 'tier-list'
        downloadBlob(blob, `${safeName}.png`)
      }
    } finally {
      setLoading(false)
    }
  }, [state])

  const handleNewList = useCallback(() => {
    replaceState(null)
    setShowStart(true)
    setShowManual(false)
    refreshSaved()
  }, [refreshSaved, replaceState])

  const handleReset = useCallback(() => {
    if (!state) return
    handleCommit(resetAllToUnranked(state), state)
  }, [state, handleCommit])

  const handleTitleBlur = useCallback(() => {
    if (!state || titleDraft === state.title) return
    handleCommit({ ...state, title: titleDraft, updatedAt: Date.now() }, state)
  }, [state, titleDraft, handleCommit])

  return (
    <div className="tier-list-game">
      <header className="tier-list-game__header">
        <button type="button" className="btn-ghost tier-list-game__back" onClick={onExit}>
          ← Exit
        </button>
        {state && (
          <>
            <input
              type="text"
              className="tier-list-game__title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Tier list title"
            />
            <div className="tier-list-game__actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
              >
                Undo
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
              >
                Redo
              </button>
              <button type="button" className="btn-ghost" onClick={handleReset} title="Return all items to unranked">
                Reset
              </button>
              <button type="button" className="btn-ghost" onClick={handleExport}>
                Download PNG
              </button>
              <button type="button" className="btn-ghost" onClick={handleNewList}>
                New list
              </button>
            </div>
          </>
        )}
      </header>

      {state && (
        <TierBoard state={state} onPreview={handlePreview} onCommit={handleCommit} />
      )}

      {showManual && (
        <ManualEditor
          onDone={handleManualDone}
          onBack={() => {
            setShowManual(false)
            setShowStart(true)
          }}
        />
      )}

      {showStart && !showManual && (
        <StartModal
          savedLists={savedLists}
          loading={loading}
          loadingLabel={loadingLabel}
          loadingDetail={loadingDetail}
          loadingError={loadingError}
          onDismissError={() => setLoadingError(null)}
          onPrompt={handlePrompt}
          onPreset={handlePreset}
          onManual={() => {
            setShowStart(false)
            setShowManual(true)
          }}
          onLoadSaved={handleLoadSaved}
          onDeleteSaved={handleDeleteSaved}
        />
      )}
    </div>
  )
}
