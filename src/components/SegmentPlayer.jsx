/*
 * Presentatie-speler voor één fragment. De echte useSegmentPlayer-hook leeft in de
 * ouder (Session), zodat het <audio>-element behouden blijft tussen fragmenten en de
 * ouder de afspeelpositie kan volgen voor de auto-pauze.
 *
 * Props:
 *  - segment: { startSec, endSec }
 *  - isPlaying, position: uit de hook
 *  - onToggle(): play/pauze (moet vanuit een tap komen, iOS)
 *  - onReplay(): fragment opnieuw vanaf het begin
 *  - rate, onCycleRate(): snelheid (0.75x / 1x / 1.25x)
 *  - compact: kleinere variant (quiz-poort)
 */
export default function SegmentPlayer({
  segment,
  isPlaying,
  position,
  onToggle,
  onReplay,
  rate,
  onCycleRate,
  compact = false,
}) {
  const total = Math.max(0.1, segment.endSec - segment.startSec)
  const within = Math.min(total, Math.max(0, position - segment.startSec))
  const pct = Math.min(100, (within / total) * 100)

  return (
    <>
      <div className={'player' + (compact ? ' compact' : '')}>
        <button type="button" className="side" onClick={onReplay} aria-label="Fragment opnieuw">
          ‹‹
        </button>
        <button
          type="button"
          className="big"
          onClick={onToggle}
          aria-label={isPlaying ? 'Pauzeer' : 'Speel af'}
        >
          {isPlaying ? (
            <span className="bars">
              <span />
              <span />
            </span>
          ) : (
            <span className="tri" />
          )}
        </button>
        <button type="button" className="rate" onClick={onCycleRate} aria-label="Snelheid">
          {formatRate(rate)}
        </button>
      </div>

      <div className="timebar">
        <span>{fmt(within)}</span>
        <div className="track">
          <i style={{ width: pct + '%' }} />
        </div>
        <span>{fmt(total)}</span>
      </div>
    </>
  )
}

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatRate(rate) {
  // 1 -> "1x", 0.75 -> "0.75x"
  return `${String(rate).replace(/\.0+$/, '')}x`
}
