export interface HangmanRoundSummary {
  won: boolean
  wrongCount: number
  secret: string
}

export function formatHangmanRoundLine(name: string, round: HangmanRoundSummary): string {
  if (round.won) {
    return `${name} solved it with ${round.wrongCount} wrong guess${round.wrongCount === 1 ? '' : 'es'}`
  }
  return `${name} did not solve it (${round.wrongCount} wrong) — word: ${round.secret}`
}

export function matchHangmanWinner(
  a: HangmanRoundSummary,
  b: HangmanRoundSummary,
  nameA: string,
  nameB: string,
): { headline: string; detail: string } {
  if (a.won && !b.won) {
    return { headline: `${nameA} wins!`, detail: `Only ${nameA} solved their word.` }
  }
  if (!a.won && b.won) {
    return { headline: `${nameB} wins!`, detail: `Only ${nameB} solved their word.` }
  }
  if (a.won && b.won) {
    if (a.wrongCount < b.wrongCount) {
      return {
        headline: `${nameA} wins!`,
        detail: `Fewer wrong guesses (${a.wrongCount} vs ${b.wrongCount}).`,
      }
    }
    if (b.wrongCount < a.wrongCount) {
      return {
        headline: `${nameB} wins!`,
        detail: `Fewer wrong guesses (${b.wrongCount} vs ${a.wrongCount}).`,
      }
    }
    return {
      headline: "It's a tie!",
      detail: `Both solved with ${a.wrongCount} wrong guesses.`,
    }
  }
  if (a.wrongCount < b.wrongCount) {
    return {
      headline: `${nameA} wins!`,
      detail: `Fewer wrong guesses (${a.wrongCount} vs ${b.wrongCount}).`,
    }
  }
  if (b.wrongCount < a.wrongCount) {
    return {
      headline: `${nameB} wins!`,
      detail: `Fewer wrong guesses (${b.wrongCount} vs ${a.wrongCount}).`,
    }
  }
  return {
    headline: 'Nobody wins',
    detail: 'Both ran out of guesses.',
  }
}

export function matchHangmanYouPeer(
  you: HangmanRoundSummary,
  peer: HangmanRoundSummary,
): { headline: string; detail: string } {
  const r = matchHangmanWinner(you, peer, 'You', 'Friend')
  if (r.headline === 'You wins!') return { headline: 'You win!', detail: r.detail }
  return r
}
