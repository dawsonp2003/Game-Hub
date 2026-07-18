import { useCallback, useRef, useState } from 'react'

interface ManualEditorProps {
  onDone: (items: { label: string; imageUrl?: string }[]) => void
  onBack: () => void
}

export default function ManualEditor({ onDone, onBack }: ManualEditorProps) {
  const [draftItems, setDraftItems] = useState<{ label: string; imageUrl?: string }[]>([])
  const [textInput, setTextInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const addTextItem = useCallback(() => {
    const label = textInput.trim()
    if (!label) return
    setDraftItems((prev) => [...prev, { label }])
    setTextInput('')
  }, [textInput])

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    for (const file of list) {
      const url = URL.createObjectURL(file)
      const label = file.name.replace(/\.[^.]+$/, '') || 'Image'
      setDraftItems((prev) => [...prev, { label, imageUrl: url }])
    }
  }, [])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        addFiles(imageFiles)
      }
    },
    [addFiles],
  )

  const removeItem = (index: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="tier-modal" role="presentation" onPaste={handlePaste}>
      <button type="button" className="tier-modal__backdrop" aria-label="Back" onClick={onBack} />
      <div className="tier-modal__dialog tier-modal__dialog--wide" role="dialog" aria-modal="true">
        <header className="tier-modal__header">
          <h2 className="tier-modal__title">Create cards manually</h2>
          <button type="button" className="tier-modal__close btn-ghost" onClick={onBack} aria-label="Back">
            ×
          </button>
        </header>

        <div className="tier-manual__add">
          <input
            type="text"
            className="tier-manual__input"
            placeholder="Card name…"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTextItem()}
          />
          <button type="button" className="btn" onClick={addTextItem} disabled={!textInput.trim()}>
            Add text
          </button>
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
            Upload images
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        <p className="tier-manual__hint">Tip: paste screenshots with Ctrl+V / Cmd+V</p>

        <div className="tier-manual__preview">
          {draftItems.length === 0 ? (
            <p className="tier-manual__empty">Add at least one card to continue.</p>
          ) : (
            draftItems.map((item, i) => (
              <div key={`${item.label}-${i}`} className="tier-manual__card">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="tier-item__img" />
                ) : (
                  <span className="tier-item__text">{item.label}</span>
                )}
                <button
                  type="button"
                  className="tier-manual__remove"
                  onClick={() => removeItem(i)}
                  aria-label={`Remove ${item.label}`}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <footer className="tier-modal__footer">
          <button type="button" className="btn-ghost" onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            className="btn"
            disabled={draftItems.length === 0}
            onClick={() => onDone(draftItems)}
          >
            Start ranking ({draftItems.length})
          </button>
        </footer>
      </div>
    </div>
  )
}
