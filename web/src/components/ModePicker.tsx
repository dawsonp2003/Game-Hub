import type { GameMode } from '../lib/multiplayer/types'
import { MODE_LABELS, MODE_HINTS } from '../lib/multiplayer/types'
import './ModePicker.css'

interface ModePickerProps {
  modes: GameMode[]
  disabledModes?: GameMode[]
  onSelect: (mode: GameMode) => void
}

export default function ModePicker({ modes, disabledModes = [], onSelect }: ModePickerProps) {
  return (
    <div className="mode-picker">
      <h2 className="mode-picker__title">Choose how to play</h2>
      <div className="mode-picker__list">
        {modes.map((mode) => {
          const disabled = disabledModes.includes(mode)
          return (
            <button
              key={mode}
              type="button"
              className={`mode-picker__btn btn ${disabled ? 'mode-picker__btn--disabled' : ''}`}
              onClick={() => !disabled && onSelect(mode)}
              disabled={disabled}
              title={disabled ? MODE_HINTS[mode] : undefined}
            >
              {MODE_LABELS[mode]}
              {disabled && mode === 'remote' && (
                <span className="mode-picker__hint">Join a room first</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
