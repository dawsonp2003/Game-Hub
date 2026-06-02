export const MAX_WRONG = 6

export default function HangmanFigure({ wrongCount }: { wrongCount: number }) {
  return (
    <div className="hm__figure" aria-hidden>
      <svg viewBox="0 0 120 140" className="hm__svg">
        <line x1="10" y1="130" x2="110" y2="130" stroke="currentColor" strokeWidth="3" />
        <line x1="30" y1="130" x2="30" y2="20" stroke="currentColor" strokeWidth="3" />
        <line x1="30" y1="20" x2="80" y2="20" stroke="currentColor" strokeWidth="3" />
        <line x1="80" y1="20" x2="80" y2="35" stroke="currentColor" strokeWidth="3" />
        {wrongCount > 0 && (
          <circle cx="80" cy="45" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
        )}
        {wrongCount > 1 && <line x1="80" y1="55" x2="80" y2="90" stroke="currentColor" strokeWidth="3" />}
        {wrongCount > 2 && <line x1="80" y1="65" x2="65" y2="80" stroke="currentColor" strokeWidth="3" />}
        {wrongCount > 3 && <line x1="80" y1="65" x2="95" y2="80" stroke="currentColor" strokeWidth="3" />}
        {wrongCount > 4 && <line x1="80" y1="90" x2="65" y2="115" stroke="currentColor" strokeWidth="3" />}
        {wrongCount > 5 && <line x1="80" y1="90" x2="95" y2="115" stroke="currentColor" strokeWidth="3" />}
      </svg>
    </div>
  )
}
