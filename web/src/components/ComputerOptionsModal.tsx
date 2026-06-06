import { useEffect, useState } from 'react'
import type { ComputerOptions, ComputerOptionsConfig } from '../lib/computer-options'
import { resolveComputerOptions } from '../lib/computer-options'
import './ComputerOptionsModal.css'

interface ComputerOptionsModalProps {
  config: ComputerOptionsConfig
  initialValues: ComputerOptions
  onConfirm: (options: ComputerOptions) => void
  onClose: () => void
}

export default function ComputerOptionsModal({
  config,
  initialValues,
  onConfirm,
  onClose,
}: ComputerOptionsModalProps) {
  const [values, setValues] = useState<ComputerOptions>(() =>
    resolveComputerOptions(config, initialValues),
  )

  useEffect(() => {
    setValues(resolveComputerOptions(config, initialValues))
  }, [config, initialValues])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setField = (fieldId: string, value: ComputerOptions[string]) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
  }

  return (
    <div className="computer-options-modal" role="presentation">
      <button
        type="button"
        className="computer-options-modal__backdrop"
        onClick={onClose}
        aria-label="Close options"
      />
      <div
        className="computer-options-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={config.title ?? 'Computer options'}
      >
        <h2 className="computer-options-modal__title">{config.title ?? 'Options'}</h2>
        {config.subtitle && <p className="computer-options-modal__subtitle">{config.subtitle}</p>}

        <form
          className="computer-options-modal__form"
          onSubmit={(e) => {
            e.preventDefault()
            onConfirm(values)
          }}
        >
          {config.fields.map((field) => (
            <fieldset key={field.id} className="computer-options-modal__field">
              <legend className="computer-options-modal__legend">{field.label}</legend>
              {field.description && (
                <p className="computer-options-modal__field-desc">{field.description}</p>
              )}
              <div className="computer-options-modal__choices">
                {field.choices.map((choice) => {
                  const id = `${field.id}-${choice.value}`
                  const checked = values[field.id] === choice.value
                  return (
                    <label key={id} className="computer-options-modal__choice">
                      <input
                        type="radio"
                        name={field.id}
                        id={id}
                        checked={checked}
                        onChange={() => setField(field.id, choice.value)}
                      />
                      <span className="computer-options-modal__choice-body">
                        <span className="computer-options-modal__choice-label">{choice.label}</span>
                        {choice.description && (
                          <span className="computer-options-modal__choice-desc">
                            {choice.description}
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}

          <div className="computer-options-modal__actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn">
              Done
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
