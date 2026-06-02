export interface LadderRoundSummary {
  finished: boolean
  /** Words added after start to finish (chain length minus 1 when done). */
  stepCount: number
  start: string
  end: string
}

export function formatLadderRoundLine(name: string, round: LadderRoundSummary): string {
  if (round.finished) {
    return `${name} finished in ${round.stepCount} step${round.stepCount === 1 ? '' : 's'} (${round.start} → ${round.end})`
  }
  return `${name} did not finish (${round.stepCount} steps tried)`
}

export function matchLadderWinner(
  a: LadderRoundSummary,
  b: LadderRoundSummary,
  nameA: string,
  nameB: string,
): { headline: string; detail: string } {
  if (a.finished && !b.finished) {
    return { headline: `${nameA} wins!`, detail: `Only ${nameA} reached the end word.` }
  }
  if (!a.finished && b.finished) {
    return { headline: `${nameB} wins!`, detail: `Only ${nameB} reached the end word.` }
  }
  if (a.finished && b.finished) {
    if (a.stepCount < b.stepCount) {
      return {
        headline: `${nameA} wins!`,
        detail: `Fewer steps (${a.stepCount} vs ${b.stepCount}).`,
      }
    }
    if (b.stepCount < a.stepCount) {
      return {
        headline: `${nameB} wins!`,
        detail: `Fewer steps (${b.stepCount} vs ${a.stepCount}).`,
      }
    }
    return {
      headline: "It's a tie!",
      detail: `Both finished in ${a.stepCount} steps.`,
    }
  }
  if (a.stepCount < b.stepCount) {
    return {
      headline: `${nameA} wins!`,
      detail: `Got closer in fewer steps (${a.stepCount} vs ${b.stepCount}).`,
    }
  }
  if (b.stepCount < a.stepCount) {
    return {
      headline: `${nameB} wins!`,
      detail: `Got closer in fewer steps (${b.stepCount} vs ${a.stepCount}).`,
    }
  }
  return {
    headline: 'Nobody wins',
    detail: 'Neither player reached the end word.',
  }
}

export function matchLadderYouPeer(
  you: LadderRoundSummary,
  peer: LadderRoundSummary,
): { headline: string; detail: string } {
  const r = matchLadderWinner(you, peer, 'You', 'Friend')
  if (r.headline === 'You wins!') return { headline: 'You win!', detail: r.detail }
  return r
}
