export interface RoundSummary {
  won: boolean
  guessCount: number
  secret: string
}

export function formatRoundLine(name: string, round: RoundSummary): string {
  if (round.won) return `${name} solved it in ${round.guessCount} guess${round.guessCount === 1 ? '' : 'es'}`
  return `${name} did not get it (word: ${round.secret})`
}

export function matchWinner(
  a: RoundSummary,
  b: RoundSummary,
  nameA: string,
  nameB: string,
): { headline: string; detail: string } {
  if (a.won && b.won) {
    if (a.guessCount < b.guessCount) {
      return {
        headline: `${nameA} wins!`,
        detail: `Fewer guesses (${a.guessCount} vs ${b.guessCount}).`,
      }
    }
    if (b.guessCount < a.guessCount) {
      return {
        headline: `${nameB} wins!`,
        detail: `Fewer guesses (${b.guessCount} vs ${a.guessCount}).`,
      }
    }
    return {
      headline: "It's a tie!",
      detail: `Both solved it in ${a.guessCount} guesses.`,
    }
  }
  if (a.won && !b.won) {
    return { headline: `${nameA} wins!`, detail: `Only ${nameA} solved their word.` }
  }
  if (!a.won && b.won) {
    return { headline: `${nameB} wins!`, detail: `Only ${nameB} solved their word.` }
  }
  return {
    headline: 'Nobody wins',
    detail: 'Both players ran out of guesses.',
  }
}

export function matchWinnerYouPeer(you: RoundSummary, peer: RoundSummary): { headline: string; detail: string } {
  const r = matchWinner(you, peer, 'You', 'Friend')
  if (r.headline === 'You wins!') return { headline: 'You win!', detail: r.detail }
  return r
}
