import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

type Transform = { scale: number; x: number; y: number }

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function useIsMobileViewport(maxWidth = 767): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidth}px)`).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [maxWidth])

  return mobile
}

/** Fit-to-view plus pinch-to-zoom and drag-to-pan — intended for coarse/mobile viewports only. */
export function usePinchPanZoom(enabled: boolean) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const transformRef = useRef(transform)
  transformRef.current = transform

  const fitToView = useCallback(() => {
    const vp = viewportRef.current
    const content = contentRef.current
    if (!vp || !content) return
    const pad = 8
    const w = content.offsetWidth
    const h = content.offsetHeight
    if (w === 0 || h === 0) return
    const scale = Math.min((vp.clientWidth - pad * 2) / w, (vp.clientHeight - pad * 2) / h, 1)
    setTransform({ scale, x: 0, y: 0 })
  }, [])

  useLayoutEffect(() => {
    if (!enabled) {
      setTransform({ scale: 1, x: 0, y: 0 })
      return
    }
    fitToView()
    const ro = new ResizeObserver(() => fitToView())
    const vp = viewportRef.current
    const content = contentRef.current
    if (vp) ro.observe(vp)
    if (content) ro.observe(content)
    return () => ro.disconnect()
  }, [enabled, fitToView])

  useEffect(() => {
    if (!enabled) return
    const vp = viewportRef.current
    if (!vp) return

    const gesture = {
      mode: 'none' as 'none' | 'pan' | 'pinch',
      startTransform: { scale: 1, x: 0, y: 0 },
      startDist: 0,
      lastMid: { x: 0, y: 0 },
    }

    const onPointerDown = (e: PointerEvent) => {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const onButton = (e.target as HTMLElement).closest('button')

      if (pointersRef.current.size >= 2 || !onButton) {
        vp.setPointerCapture(e.pointerId)
      }

      if (pointersRef.current.size === 1 && !onButton) {
        gesture.mode = 'pan'
        gesture.startTransform = { ...transformRef.current }
        gesture.lastMid = { x: e.clientX, y: e.clientY }
      } else if (pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.values()]
        gesture.mode = 'pinch'
        gesture.startTransform = { ...transformRef.current }
        gesture.startDist = distance(pts[0]!, pts[1]!)
        gesture.lastMid = midpoint(pts[0]!, pts[1]!)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return
      if (gesture.mode === 'none') return

      e.preventDefault()
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const pts = [...pointersRef.current.values()]

      if (gesture.mode === 'pinch' && pts.length >= 2) {
        const dist = distance(pts[0]!, pts[1]!)
        const mid = midpoint(pts[0]!, pts[1]!)
        const ratio = gesture.startDist > 0 ? dist / gesture.startDist : 1
        const nextScale = Math.min(3, Math.max(0.35, gesture.startTransform.scale * ratio))
        const dx = mid.x - gesture.lastMid.x
        const dy = mid.y - gesture.lastMid.y
        setTransform({
          scale: nextScale,
          x: gesture.startTransform.x + dx,
          y: gesture.startTransform.y + dy,
        })
        gesture.lastMid = mid
        return
      }

      if (gesture.mode === 'pan' && pts.length === 1) {
        const dx = e.clientX - gesture.lastMid.x
        const dy = e.clientY - gesture.lastMid.y
        gesture.lastMid = { x: e.clientX, y: e.clientY }
        setTransform((prev) => ({
          ...prev,
          x: prev.x + dx,
          y: prev.y + dy,
        }))
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId)
      try {
        vp.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      if (pointersRef.current.size === 0) {
        gesture.mode = 'none'
      } else if (pointersRef.current.size === 1) {
        gesture.mode = 'pan'
        const pt = [...pointersRef.current.values()][0]!
        gesture.startTransform = { ...transformRef.current }
        gesture.lastMid = { ...pt }
      }
    }

    vp.addEventListener('pointerdown', onPointerDown)
    vp.addEventListener('pointermove', onPointerMove, { passive: false })
    vp.addEventListener('pointerup', onPointerUp)
    vp.addEventListener('pointercancel', onPointerUp)

    return () => {
      vp.removeEventListener('pointerdown', onPointerDown)
      vp.removeEventListener('pointermove', onPointerMove)
      vp.removeEventListener('pointerup', onPointerUp)
      vp.removeEventListener('pointercancel', onPointerUp)
    }
  }, [enabled])

  return { viewportRef, contentRef, transform, fitToView }
}
