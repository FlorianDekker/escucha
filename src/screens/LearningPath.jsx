import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { playClick } from '../lib/sounds'
import { useStore } from '../lib/store'
import { loadLadder } from '../lib/contentLoader'
import TabBar from '../components/TabBar.jsx'
import '../overview.css'

/*
 * Leidt de voortgang af uit ladder + store.episodes met dezelfde logica als de sessie-kant.
 * - step done   = store.episodes[unit.episodeId]?.completedSteps bevat step.id
 * - step current = eerste niet-afgeronde step van de eerste unit die niet volledig af is
 * - step locked  = alles ná de current step (en alle steps in latere units)
 * - unit af      = gate-step done EN scorePct >= passPct
 * Geëxporteerd zodat Home dezelfde bron gebruikt.
 */
export function computeProgress(ladder, episodes) {
  const units = ladder?.units || []

  const unitInfos = units.map((unit, index) => {
    const ep = episodes[unit.episodeId]
    const completed = ep?.completedSteps || []
    const steps = (unit.steps || []).map((step) => ({ ...step, done: completed.includes(step.id) }))
    const doneCount = steps.filter((s) => s.done).length
    const gate = steps.find((s) => s.type === 'gate')
    const gateDone = gate ? gate.done : steps.every((s) => s.done)
    const passPct = gate?.passPct ?? 0
    const scorePct = ep?.scorePct ?? 0
    const unitComplete = gateDone && scorePct >= passPct
    return { unit, index, ep, steps, doneCount, total: steps.length, unitComplete, scorePct, passPct }
  })

  const firstIncomplete = unitInfos.findIndex((u) => !u.unitComplete)
  const currentUnitIndex = firstIncomplete === -1 ? Math.max(0, units.length - 1) : firstIncomplete

  let current = null
  unitInfos.forEach((u) => {
    if (u.index < currentUnitIndex) {
      u.steps.forEach((s) => (s.status = 'done'))
    } else if (u.index === currentUnitIndex) {
      let currentSet = false
      u.steps.forEach((s, i) => {
        if (s.done) {
          s.status = 'done'
        } else if (!currentSet) {
          s.status = 'current'
          currentSet = true
          current = { unit: u.unit, unitIndex: u.index, step: s, stepIndex: i }
        } else {
          s.status = 'locked'
        }
      })
      // Alle steps af maar unit niet "compleet" (bijv. quiz-score te laag): laat de laatste step
      // opnieuw als current zien zodat je de poort kunt overdoen.
      if (!currentSet && u.steps.length) {
        const last = u.steps.length - 1
        u.steps[last].status = 'current'
        current = { unit: u.unit, unitIndex: u.index, step: u.steps[last], stepIndex: last }
      }
    } else {
      u.steps.forEach((s) => (s.status = 'locked'))
    }
  })

  return { unitInfos, currentUnitIndex, current }
}

function stepLabel(step) {
  if (step.type === 'words') return 'Woorden'
  if (step.type === 'gate') return 'Quiz · poort'
  if (step.type === 'read') return step.labelNl || 'Lezen'
  return step.labelNl || 'Luister'
}

function iconTypeFor(step) {
  if (step.type === 'words') return 'words'
  if (step.type === 'gate') return 'gate'
  if (step.type === 'read') return 'read'
  return 'listen'
}

// Verticaal ritme van het knopenpad en de starthoogte binnen het frame.
const RHYTHM = 92
const TOP0 = 24

// Horizontale positie: eerste knoop midden, daarna afwisselend links/rechts.
function leftFor(index) {
  if (index === 0) return '46.5%'
  return index % 2 === 1 ? '29%' : '64.5%'
}

// SVG-iconen exact uit het design, kleur via stroke (wit bij done, grijs bij locked).
function StepIcon({ type, color }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'words') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" {...stroke}>
        <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H6a2 2 0 0 1-2-2V6z" />
        <path d="M8 9h8" />
        <path d="M8 12h5" />
      </svg>
    )
  }
  if (type === 'gate') {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" {...stroke}>
        <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </svg>
    )
  }
  if (type === 'read') {
    // open boek
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" {...stroke}>
        <path d="M12 6c-1.5-1.4-3.7-2-6.5-2v13c2.8 0 5 .6 6.5 2 1.5-1.4 3.7-2 6.5-2V4c-2.8 0-5 .6-6.5 2z" />
        <path d="M12 6v13" />
      </svg>
    )
  }
  // listen
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="3.8" y="12.5" width="3.6" height="7" rx="1.6" />
      <rect x="16.6" y="12.5" width="3.6" height="7" rx="1.6" />
    </svg>
  )
}

function ChestIcon({ color }) {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8.5" width="16" height="4" rx="1" />
      <path d="M5.5 12.5V20h13v-7.5" />
      <path d="M12 8.5V20" />
      <path d="M12 8.5C10.5 8.5 8.5 8 8.5 6.2 8.5 5 9.4 4 10.5 4c1.5 0 1.5 2 1.5 4.5z" />
      <path d="M12 8.5c1.5 0 3.5-.5 3.5-2.3C15.5 5 14.6 4 13.5 4 12 4 12 6 12 8.5z" />
    </svg>
  )
}

function PathNode({ step, unitId, top, left }) {
  const status = step.status
  const label = stepLabel(step)
  const iconType = iconTypeFor(step)
  const wrap = { position: 'absolute', top, left, transform: 'translateX(-50%)', textAlign: 'center' }

  if (status === 'current') {
    return (
      <div style={{ ...wrap, zIndex: 3 }}>
        <div style={{ position: 'relative', width: 76, height: 68, margin: '0 auto' }}>
          <div style={{ position: 'absolute', top: -26, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
            <div
              style={{
                whiteSpace: 'nowrap',
                background: '#fff',
                color: 'var(--accent)',
                fontFamily: 'var(--font-head)',
                fontWeight: 800,
                fontSize: 11,
                padding: '5px 11px',
                borderRadius: 12,
                boxShadow: '0 6px 14px rgba(20,22,58,.2)',
                animation: 'floaty 2.6s ease-in-out infinite',
              }}
            >
              START ▸
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 76,
              height: 75,
              borderRadius: '50% / 54%',
              background: 'var(--accent)',
              opacity: 0.5,
              animation: 'pulseRing 1.8s ease-out infinite',
            }}
          />
          <Link
            to={`/session/${unitId}/${step.id}`}
            className="node--current-inner"
            style={{ position: 'relative' }}
            aria-label={label}
            onClick={playClick}
          >
            <span className="play-tri play-tri--lg" />
          </Link>
        </div>
        <p style={{ margin: '8px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 13, color: 'var(--accent)' }}>
          {label}
        </p>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div style={wrap}>
        <Link
          to={`/session/${unitId}/${step.id}`}
          className="node node--done"
          aria-label={label}
          onClick={playClick}
        >
          <StepIcon type={iconType} color="#fff" />
        </Link>
        <p style={{ margin: '5px 0 0', fontWeight: 800, fontSize: 11, color: 'var(--ink-mute)' }}>{label}</p>
      </div>
    )
  }

  // locked
  return (
    <div style={wrap}>
      <div className="node node--locked" aria-label={label}>
        <StepIcon type={iconType} color="#9998BE" />
      </div>
      <p style={{ margin: '5px 0 0', fontWeight: 800, fontSize: 11, color: 'var(--ink-faint)' }}>{label}</p>
    </div>
  )
}

export default function LearningPath() {
  const episodes = useStore((s) => s.episodes)
  const [ladder, setLadder] = useState(null)

  useEffect(() => {
    loadLadder().then(setLadder).catch(() => setLadder({ units: [] }))
  }, [])

  const progress = ladder ? computeProgress(ladder, episodes) : null
  const units = ladder?.units || []
  const currentUnit = progress ? progress.unitInfos[progress.currentUnitIndex] : null

  const nextUnitExists = progress && progress.currentUnitIndex + 1 < units.length
  const chestLabel = nextUnitExists ? `Unidad ${progress.currentUnitIndex + 2}` : 'Binnenkort meer'

  return (
    <div className="screen screen--page">
      <div className="screen__scroll">
        {/* Unit-header */}
        <div className="brand-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p
                style={{
                  margin: 0,
                  color: 'var(--brand-soft)',
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: '.08em',
                }}
              >
                UNIDAD {progress ? progress.currentUnitIndex + 1 : 1}
              </p>
              <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 22 }}>
                {currentUnit ? currentUnit.unit.title : 'Leerpad'}
              </p>
            </div>
            {currentUnit && (
              <div
                style={{
                  textAlign: 'center',
                  background: 'rgba(255,255,255,.14)',
                  borderRadius: 16,
                  padding: '8px 14px',
                }}
              >
                <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 17 }}>
                  {currentUnit.doneCount}/{currentUnit.total}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: 10, fontWeight: 700, color: 'var(--brand-soft)' }}>
                  stappen
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Knopenpad */}
        <div
          style={{
            position: 'relative',
            minHeight: currentUnit ? TOP0 + (currentUnit.steps.length + 1) * RHYTHM + 40 : 200,
          }}
        >
          {currentUnit &&
            currentUnit.steps.map((step, i) => (
              <PathNode
                key={step.id}
                step={step}
                unitId={currentUnit.unit.id}
                top={TOP0 + i * RHYTHM}
                left={leftFor(i)}
              />
            ))}

          {/* Kist voor de volgende unit: altijd midden, na de laatste stap */}
          {currentUnit && (
            <div
              style={{
                position: 'absolute',
                top: TOP0 + currentUnit.steps.length * RHYTHM,
                left: '46.5%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
              }}
            >
              <div className="node node--chest" aria-label={chestLabel}>
                <ChestIcon color="#9998BE" />
              </div>
              <p style={{ margin: '5px 0 0', fontWeight: 800, fontSize: 11, color: 'var(--ink-faint)' }}>{chestLabel}</p>
            </div>
          )}

          {!currentUnit && (
            <p style={{ textAlign: 'center', color: 'var(--ink-mute)', fontWeight: 700, marginTop: 40 }}>
              Nog geen leerpad beschikbaar.
            </p>
          )}
        </div>
      </div>

      <TabBar variant="light" />
    </div>
  )
}
