import { useCallback, useRef, useState } from 'react'
import './SnakeJoystick.css'

type Dir = 'up' | 'down' | 'left' | 'right'

interface SnakeJoystickProps {
  onDirection: (dir: Dir) => void
  disabled?: boolean
}

const DEAD_ZONE = 14
const MAX_RADIUS = 44

function offsetToDir(dx: number, dy: number): Dir | null {
  const dist = Math.hypot(dx, dy)
  if (dist < DEAD_ZONE) return null
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left'
  }
  return dy > 0 ? 'down' : 'up'
}

export default function SnakeJoystick({ onDirection, disabled }: SnakeJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const activeRef = useRef(false)
  const lastDirRef = useRef<Dir | null>(null)

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current
      if (!base || disabled) return

      const rect = base.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      let dx = clientX - cx
      let dy = clientY - cy
      const dist = Math.hypot(dx, dy)

      if (dist > MAX_RADIUS) {
        const scale = MAX_RADIUS / dist
        dx *= scale
        dy *= scale
      }

      setKnob({ x: dx, y: dy })

      const dir = offsetToDir(dx, dy)
      if (dir && dir !== lastDirRef.current) {
        lastDirRef.current = dir
        onDirection(dir)
      }
      if (!dir) {
        lastDirRef.current = null
      }
    },
    [disabled, onDirection],
  )

  const resetKnob = useCallback(() => {
    activeRef.current = false
    setKnob({ x: 0, y: 0 })
    lastDirRef.current = null
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    activeRef.current = true
    baseRef.current?.setPointerCapture(e.pointerId)
    updateFromPointer(e.clientX, e.clientY)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!activeRef.current) return
    e.preventDefault()
    updateFromPointer(e.clientX, e.clientY)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!activeRef.current) return
    try {
      baseRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    resetKnob()
  }

  return (
    <div
      className={`snake-joystick${disabled ? ' snake-joystick--disabled' : ''}`}
      aria-hidden={disabled}
    >
      <div
        ref={baseRef}
        className="snake-joystick__base"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="presentation"
      >
        <div
          className="snake-joystick__knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>
      <span className="snake-joystick__hint">Drag to steer</span>
    </div>
  )
}
