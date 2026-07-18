import { useEffect, useState } from 'react'
import LoadingSpinner from '../../components/LoadingSpinner'
import type { SavedTierListMeta } from '../../lib/tier-list/storage'
import { TIER_PRESETS } from './presets'

export type StartMode = 'home' | 'prompt' | 'preset' | 'manual'

interface StartModalProps {
  savedLists: SavedTierListMeta[]
  loading: boolean
  loadingLabel: string
  loadingDetail?: string
  loadingError?: string | null
  onDismissError?: () => void
  onPrompt: (prompt: string) => void
  onPreset: (presetId: string) => void
  onManual: () => void
  onLoadSaved: (id: string) => void
  onDeleteSaved: (id: string) => void
}

export default function StartModal({
  savedLists,
  loading,
  loadingLabel,
  loadingDetail,
  loadingError,
  onDismissError,
  onPrompt,
  onPreset,
  onManual,
  onLoadSaved,
  onDeleteSaved,
}: StartModalProps) {
  const [mode, setMode] = useState<StartMode>('home')
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode !== 'home') setMode('home')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  if (loadingError) {
    return (
      <div className="tier-modal" role="presentation">
        <div className="tier-modal__backdrop tier-modal__backdrop--static" />
        <div className="tier-modal__dialog tier-modal__dialog--center tier-status tier-status--error" role="alertdialog" aria-modal="true" aria-labelledby="tier-status-error-title">
          <p id="tier-status-error-title" className="tier-status__title">Couldn&apos;t generate list</p>
          <p className="tier-status__message">{loadingError}</p>
          <button type="button" className="btn tier-status__dismiss" onClick={onDismissError}>
            OK
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="tier-modal" role="presentation">
        <div className="tier-modal__backdrop tier-modal__backdrop--static" />
        <div className="tier-modal__dialog tier-modal__dialog--center">
          <LoadingSpinner
            label={loadingLabel}
            detail={loadingDetail}
            className="loading-spinner--modal"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="tier-modal" role="presentation">
      <div className="tier-modal__backdrop tier-modal__backdrop--static" />
      <div className="tier-modal__dialog" role="dialog" aria-modal="true">
        {mode === 'home' && (
          <>
            <header className="tier-modal__header">
              <h2 className="tier-modal__title">Tier List</h2>
            </header>
            <p className="tier-modal__subtitle">Rank items from S (best) to F (worst). Drag left = higher within a tier.</p>

            <div className="tier-start__actions">
              <button type="button" className="tier-start__btn" onClick={() => setMode('prompt')}>
                <span className="tier-start__btn-icon">✨</span>
                <span>
                  <strong>Generate from prompt</strong>
                  <small>e.g. &quot;Pokemon&quot;, &quot;Mario characters&quot;</small>
                </span>
              </button>
              <button type="button" className="tier-start__btn" onClick={() => setMode('preset')}>
                <span className="tier-start__btn-icon">📋</span>
                <span>
                  <strong>Choose a preset</strong>
                  <small>Curated lists with images</small>
                </span>
              </button>
              <button type="button" className="tier-start__btn" onClick={onManual}>
                <span className="tier-start__btn-icon">🖼️</span>
                <span>
                  <strong>Create cards manually</strong>
                  <small>Text, upload, or paste images</small>
                </span>
              </button>
            </div>

            {savedLists.length > 0 && (
              <section className="tier-start__saved">
                <h3 className="tier-start__saved-title">Saved lists</h3>
                <ul className="tier-start__saved-list">
                  {savedLists.map((list) => (
                    <li key={list.id} className="tier-start__saved-item">
                      <button type="button" className="tier-start__saved-load" onClick={() => onLoadSaved(list.id)}>
                        <strong>{list.title}</strong>
                        <small>
                          {list.itemCount} items · {new Date(list.savedAt).toLocaleDateString()}
                        </small>
                      </button>
                      <button
                        type="button"
                        className="tier-start__saved-delete btn-ghost"
                        onClick={() => onDeleteSaved(list.id)}
                        aria-label={`Delete ${list.title}`}
                      >
                        🗑
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {mode === 'prompt' && (
          <>
            <header className="tier-modal__header">
              <h2 className="tier-modal__title">What do you want to rank?</h2>
              <button type="button" className="tier-modal__close btn-ghost" onClick={() => setMode('home')} aria-label="Back">
                ×
              </button>
            </header>
            <input
              type="text"
              className="tier-manual__input tier-manual__input--full"
              placeholder='e.g. "Pokemon", "Characters in Mario", "Superhero villains"'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && prompt.trim() && onPrompt(prompt)}
              autoFocus
            />
            <footer className="tier-modal__footer">
              <button type="button" className="btn-ghost" onClick={() => setMode('home')}>
                Back
              </button>
              <button
                type="button"
                className="btn"
                disabled={!prompt.trim()}
                onClick={() => onPrompt(prompt)}
              >
                Generate cards
              </button>
            </footer>
          </>
        )}

        {mode === 'preset' && (
          <>
            <header className="tier-modal__header">
              <h2 className="tier-modal__title">Choose a preset</h2>
              <button type="button" className="tier-modal__close btn-ghost" onClick={() => setMode('home')} aria-label="Back">
                ×
              </button>
            </header>
            <ul className="tier-start__preset-list">
              {TIER_PRESETS.map((preset) => (
                <li key={preset.id}>
                  <button type="button" className="tier-start__preset" onClick={() => onPreset(preset.id)}>
                    <strong>{preset.title}</strong>
                    <small>{preset.description} · {preset.items.length} items</small>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
