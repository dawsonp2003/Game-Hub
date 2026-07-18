import { useCallback, useEffect, useRef, useState } from 'react'
import type { TierListState } from './types'

const MAX_HISTORY = 60

function cloneState(state: TierListState): TierListState {
  return structuredClone(state)
}

function statesEqual(a: TierListState, b: TierListState): boolean {
  return (
    a.title === b.title &&
    a.unranked.join(',') === b.unranked.join(',') &&
    a.tiers.every((t, i) => {
      const other = b.tiers[i]
      return other && t.id === other.id && t.itemIds.join(',') === other.itemIds.join(',')
    })
  )
}

export function useTierListHistory(initial: TierListState | null) {
  const [state, setState] = useState<TierListState | null>(initial)
  const pastRef = useRef<TierListState[]>([])
  const futureRef = useRef<TierListState[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  const resetHistory = useCallback(() => {
    pastRef.current = []
    futureRef.current = []
    syncFlags()
  }, [syncFlags])

  const replaceState = useCallback(
    (next: TierListState | null) => {
      setState(next)
      resetHistory()
    },
    [resetHistory],
  )

  const commitState = useCallback(
    (next: TierListState, beforeSnapshot?: TierListState) => {
      setState((current) => {
        const before = beforeSnapshot ?? current
        if (before && !statesEqual(before, next)) {
          pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), cloneState(before)]
          futureRef.current = []
        }
        return next
      })
      syncFlags()
    },
    [syncFlags],
  )

  const previewState = useCallback((next: TierListState) => {
    setState((current) => {
      if (!current) return next
      // Keep updatedAt stable during drag preview so autosave doesn't fire mid-drag.
      return { ...next, updatedAt: current.updatedAt }
    })
  }, [])

  const undo = useCallback(() => {
    setState((current) => {
      if (!current || pastRef.current.length === 0) return current
      futureRef.current = [cloneState(current), ...futureRef.current]
      const prev = pastRef.current.pop()!
      syncFlags()
      return { ...prev, updatedAt: Date.now() }
    })
  }, [syncFlags])

  const redo = useCallback(() => {
    setState((current) => {
      if (!current || futureRef.current.length === 0) return current
      pastRef.current = [...pastRef.current, cloneState(current)]
      const next = futureRef.current.shift()!
      syncFlags()
      return { ...next, updatedAt: Date.now() }
    })
  }, [syncFlags])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!state) return
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, undo, redo])

  return {
    state,
    canUndo,
    canRedo,
    replaceState,
    commitState,
    previewState,
    undo,
    redo,
    resetHistory,
  }
}
