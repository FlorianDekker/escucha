import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  return step.labelNl || 'Luister'
}

// Zigzag-offsets zoals in het design: midden, links, midden, rechts, ...
const OFFSETS = [0, -46, 0, 46]

function PathNode({ status, unitId, stepId, label, offset }) {
  const labelStyle = {
    textAlign: 'center',
    margin: '6px 0 0',
    transform: `translateX(${offset}px)`,
    fontWeight: 800,
    fontSize: 11,
  }

  if (status === 'current') {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: -6,
              transform: `translateX(${offset + 44}px)`,
              background: '#fff',
              color: 'var(--accent)',
              fontFamily: 'var(--font-head)',
              fontWeight: 800,
              fontSize: 11,
              padding: '5px 11px',
              borderRadius: 12,
              boxShadow: '0 6px 14px rgba(20,22,58,.2)',
              animation: 'floaty 2.6s ease-in-out infinite',
              whiteSpace: 'nowrap',
              zIndex: 2,
            }}
          >
            START ▸
          </div>
          <div style={{ position: 'relative', width: 76, height: 72, transform: `translateX(${offset}px)` }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'var(--accent)',
                opacity: 0.5,
                animation: 'pulseRing 1.8s ease-out infinite',
              }}
            />
            <Link
              to={`/session/${unitId}/${stepId}`}
              className="node--current-inner"
              style={{ position: 'relative' }}
              aria-label={label}
            >
              <span className="play-tri play-tri--lg" />
            </Link>
          </div>
        </div>
        <p
          style={{
            ...labelStyle,
            fontFamily: 'var(--font-head)',
            fontSize: 13,
            color: 'var(--accent)',
          }}
        >
          {label}
        </p>
      </>
    )
  }

  const node =
    status === 'done' ? (
      <Link
        to={`/session/${unitId}/${stepId}`}
        className="node node--done"
        style={{ transform: `translateX(${offset}px)` }}
        aria-label={label}
      >
        <span style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>✓</span>
      </Link>
    ) : (
      <div className="node node--locked" style={{ transform: `translateX(${offset}px)` }} aria-label={label}>
        <span style={{ color: '#9998BE', fontSize: 22 }}>🔒</span>
      </div>
    )

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center' }}>{node}</div>
      <p style={{ ...labelStyle, color: status === 'done' ? 'var(--ink-mute)' : 'var(--ink-faint)' }}>{label}</p>
    </>
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
        <div style={{ padding: '30px 0 24px' }}>
          {currentUnit &&
            currentUnit.steps.map((step, i) => (
              <div key={step.id}>
                {i > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div className="path-connector" style={{ transform: `translateX(${OFFSETS[i % 4]}px)` }} />
                  </div>
                )}
                <PathNode
                  status={step.status}
                  unitId={currentUnit.unit.id}
                  stepId={step.id}
                  label={stepLabel(step)}
                  offset={OFFSETS[i % 4]}
                />
              </div>
            ))}

          {/* Kist voor de volgende unit */}
          {currentUnit && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                  className="path-connector"
                  style={{ transform: `translateX(${OFFSETS[currentUnit.steps.length % 4]}px)` }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                  className="node node--chest"
                  style={{ transform: `translateX(${OFFSETS[currentUnit.steps.length % 4]}px)` }}
                >
                  <span style={{ fontSize: 24 }}>🎁</span>
                </div>
              </div>
              <p
                style={{
                  textAlign: 'center',
                  margin: '6px 0 0',
                  transform: `translateX(${OFFSETS[currentUnit.steps.length % 4]}px)`,
                  fontWeight: 800,
                  fontSize: 11,
                  color: 'var(--ink-faint)',
                }}
              >
                {chestLabel}
              </p>
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
