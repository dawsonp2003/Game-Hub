import type { GameProps } from '../types'
import WordChainPassAndPlay from './WordChainPassAndPlay'
import WordChainRemote from './WordChainRemote'
import './WordChain.css'

export default function WordChain({ mode, session, peerAway = false, onExit }: GameProps) {
  if (mode === 'pass-and-play') {
    return <WordChainPassAndPlay onExit={onExit} />
  }

  if (mode === 'async' || mode === 'remote') {
    return <WordChainRemote session={session} peerAway={peerAway} onExit={onExit} mode={mode} />
  }

  return (
    <div className="wch wch--results">
      <p className="wch__results-headline">Word Chain</p>
      <p className="wch__results-detail">
        Play with a friend — pass &amp; play on one device or remote in a room. Each player builds an
        8-word compound chain for the other to solve.
      </p>
      <button type="button" className="btn btn-secondary" onClick={onExit}>
        Back to menu
      </button>
    </div>
  )
}
