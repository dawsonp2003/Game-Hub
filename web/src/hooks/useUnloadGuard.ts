import { useEffect } from 'react'
import { waitForPendingFlush } from '../lib/checkpoint'

/** Warn before unload when a cloud checkpoint flush is still in flight. */
export function useUnloadGuard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    const handler = (e: BeforeUnloadEvent) => {
      void waitForPendingFlush().then(() => {
        /* flush completed — allow navigation on next attempt */
      })
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled])
}
