export interface ChainRoundSummary {
  /** Guessed every word after the starter (indices 1–7). */
  finished: boolean
  mistakes: number
  /** How many words are fully revealed (1–8). */
  revealedCount: number
}

export function formatChainRoundLine(name: string, round: ChainRoundSummary): string {
  const guessed = round.revealedCount - 1
  const total = 7
  if (round.finished) {
    return `${name} completed the chain with ${round.mistakes} mistake${round.mistakes === 1 ? '' : 's'}`
  }
  return `${name}: ${guessed}/${total} words, ${round.mistakes} mistake${round.mistakes === 1 ? '' : 's'}`
}

export function matchChainWinner(
  a: ChainRoundSummary,
  b: ChainRoundSummary,
  nameA: string,
  nameB: string,
): { headline: string; detail: string } {
  if (a.finished && !b.finished) {
    return {
      headline: `${nameA} wins!`,
      detail: `Only ${nameA} finished the chain. Fewer mistakes matter when both finish.`,
    }
  }
  if (!a.finished && b.finished) {
    return {
      headline: `${nameB} wins!`,
      detail: `Only ${nameB} finished the chain.`,
    }
  }

  if (a.finished && b.finished) {
    if (a.mistakes < b.mistakes) {
      return {
        headline: `${nameA} wins!`,
        detail: `Both finished — ${a.mistakes} mistake${a.mistakes === 1 ? '' : 's'} vs ${b.mistakes}.`,
      }
    }
    if (b.mistakes < a.mistakes) {
      return {
        headline: `${nameB} wins!`,
        detail: `Both finished — ${b.mistakes} mistake${b.mistakes === 1 ? '' : 's'} vs ${a.mistakes}.`,
      }
    }
    return {
      headline: "It's a tie!",
      detail: `Both finished with ${a.mistakes} mistake${a.mistakes === 1 ? '' : 's'}.`,
    }
  }

  if (a.revealedCount !== b.revealedCount) {
    const leader = a.revealedCount > b.revealedCount ? nameA : nameB
    const leaderRound = a.revealedCount > b.revealedCount ? a : b
    const other = a.revealedCount > b.revealedCount ? b : a
    return {
      headline: `${leader} wins!`,
      detail: `Got further (${leaderRound.revealedCount - 1}/7 words vs ${other.revealedCount - 1}/7).`,
    }
  }

  if (a.mistakes < b.mistakes) {
    return {
      headline: `${nameA} wins!`,
      detail: `Same progress — fewer mistakes (${a.mistakes} vs ${b.mistakes}).`,
    }
  }
  if (b.mistakes < a.mistakes) {
    return {
      headline: `${nameB} wins!`,
      detail: `Same progress — fewer mistakes (${b.mistakes} vs ${a.mistakes}).`,
    }
  }

  return {
    headline: "It's a tie!",
    detail: 'Same progress and mistakes.',
  }
}

export function matchChainYouPeer(
  you: ChainRoundSummary,
  peer: ChainRoundSummary,
): { headline: string; detail: string } {
  const r = matchChainWinner(you, peer, 'You', 'Friend')
  if (r.headline === 'You wins!') return { headline: 'You win!', detail: r.detail }
  return r
}
