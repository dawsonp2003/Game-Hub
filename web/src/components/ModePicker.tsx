import type { GameMode } from '../lib/multiplayer/types'
import { MODE_LABELS } from '../lib/multiplayer/types'
import './ModePicker.css'

interface ModePickerProps {
  modes: GameMode[]
  onSelect: (mode: GameMode) => void
}

export default function ModePicker({ modes, onSelect }: ModePickerProps) {
  return (
    <div className="mode-picker">
      <h2 className="mode-picker__title">Choose how to play</h2>
      <div className="mode-picker__list">
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            className="mode-picker__btn btn"
            onClick={() => onSelect(mode)}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>
    </div>
  )
}
