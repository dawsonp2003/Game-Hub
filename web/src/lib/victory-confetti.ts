import confetti from 'canvas-confetti'

let lastFireAt = 0

/** Whether a results headline means the local player / device should celebrate. */
export function shouldCelebrateVictory(headline: string): boolean {
  const h = headline.trim().toLowerCase()
  if (!h) return false
  if (h.includes('tie') || h.includes('nobody wins')) return false
  if (h.includes('you lose') || h.includes('friend wins') || h.includes('computer wins')) return false
  if (h.includes('you win')) return true
  if (/player \d+ wins!/.test(h)) return true
  if (/^[xo] wins!$/.test(h)) return true
  return false
}

export function fireVictoryConfetti(): void {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const now = Date.now()
  if (now - lastFireAt < 400) return
  lastFireAt = now

  const duration = 2400
  const end = Date.now() + duration

  confetti({
    particleCount: 90,
    spread: 80,
    startVelocity: 42,
    origin: { y: 0.55 },
    zIndex: 9999,
  })

  const tick = () => {
    confetti({
      particleCount: 2,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.65 },
      zIndex: 9999,
    })
    confetti({
      particleCount: 2,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.65 },
      zIndex: 9999,
    })
    if (Date.now() < end) requestAnimationFrame(tick)
  }

  tick()
}
