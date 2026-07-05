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
 * Geëxporteerd zodat Home dezelfde bron gebruikt (signature ongewijzigd).
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

/* Admin-stand (instelling "Alle lessen ontgrendeld"): locked steps worden
   aanklikbaar ('open'); done/current blijven zoals ze zijn. */
export function unlockProgress(progress) {
  progress.unitInfos.forEach((u) => {
    u.steps.forEach((s) => {
      if (s.status === 'locked') s.status = 'open'
    })
  })
  return progress
}

/*
 * Hoofdstuklogica bovenop het unit-niveau van computeProgress.
 * - Een hoofdstuk is af als het units heeft én al zijn units unitComplete zijn.
 * - Het huidige hoofdstuk = eerste niet-afgeronde hoofdstuk met units.
 * - Hoofdstukken zonder units of ná het huidige zijn locked (behalve in admin).
 */
function computeChapters(ladder, progress, unlockAll) {
  const chapters = ladder?.chapters || []
  const byId = {}
  ;(progress?.unitInfos || []).forEach((u) => {
    byId[u.unit.id] = u
  })

  const infos = chapters.map((chapter, index) => {
    const units = (chapter.unitIds || []).map((id) => byId[id]).filter(Boolean)
    const hasUnits = units.length > 0
    const complete = hasUnits && units.every((u) => u.unitComplete)
    return { chapter, index, units, hasUnits, complete }
  })

  let currentChapterIndex = infos.findIndex((c) => c.hasUnits && !c.complete)
  if (currentChapterIndex === -1) {
    // Alle hoofdstukken-met-units zijn af: val terug op het laatste hoofdstuk met units.
    const withUnits = infos.filter((c) => c.hasUnits)
    currentChapterIndex = withUnits.length ? withUnits[withUnits.length - 1].index : 0
  }

  infos.forEach((c) => {
    if (c.complete) c.status = 'complete'
    else if (c.index === currentChapterIndex) c.status = 'current'
    else c.status = 'locked'
    c.openable = unlockAll || c.status === 'complete' || c.status === 'current'
  })

  return { infos, currentChapterIndex }
}

// Eerste niet-afgeronde step van een unit, of de eerste step als alles af is.
function firstStepId(unitInfo) {
  const steps = unitInfo.steps || []
  const next = steps.find((s) => !s.done)
  return (next || steps[0])?.id
}

const asset = (name) => `${import.meta.env.BASE_URL}art/path/${name}`

// Per-illustratie breedte en verticale offset (t.o.v. het 188x150 eiland-frame), zoals het mock.
const ART = {
  'surfer.svg': { w: 150, top: -42 },
  'climbing.svg': { w: 160, top: -94 },
  'standout.svg': { w: 158, top: -117 },
  'curly.svg': { w: 132, top: -74 },
  'ash.svg': { w: 152, top: -94 },
  'mother.svg': { w: 152, top: -90 },
}
const ART_FALLBACK = { w: 150, top: -72 }

// Zigzag-offsets voor de gestapelde eilanden.
const ISLAND_OFFSETS = [-40, 46, -28]

// De 8 thema-iconen, exact overgenomen uit het hoofddesign (scherm 2 · Jouw reis).
function ChapterIcon({ theme, color, size = 28 }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const svg = (children, s = size) => (
    <svg width={s} height={s} viewBox="0 0 24 24" {...p}>
      {children}
    </svg>
  )
  switch (theme) {
    case 'aventura': // berglandschap
      return svg(
        <>
          <path d="M3 19l6-10 4 6 2-3 6 7z" />
          <circle cx="17" cy="6" r="1.6" />
        </>,
      )
    case 'familia': // twee personen
      return svg(
        <>
          <circle cx="9" cy="8.5" r="2.4" />
          <circle cx="16" cy="9.5" r="2" />
          <path d="M4.5 19c0-3 2-4.7 4.5-4.7s4.5 1.7 4.5 4.7" />
          <path d="M14.5 14.6c2 .1 4 1.3 4 4.4" />
        </>,
      )
    case 'rico': // bestek / vork
      return svg(
        <>
          <path d="M7 3v18" />
          <path d="M5 3v5a2 2 0 0 0 4 0V3" />
          <path d="M16 3c1.8 1.5 1.8 6.5 0 8v10" />
        </>,
        26,
      )
    case 'viaje': // papieren vliegtuig
      return svg(
        <>
          <path d="M21 4L3 11l6 2 2 6 4-6z" />
          <path d="M9 13l7-5" />
        </>,
        27,
      )
    case 'animales': // blad
      return svg(
        <>
          <path d="M5 19C6 10 12 5 19 5c-.5 9-6 14-14 14z" />
          <path d="M5 19c3-6 7-9 11-11" />
        </>,
        27,
      )
    case 'amor': // hart
      return svg(
        <path d="M12 20s-6.5-4.2-6.5-9.2A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 6.5 2.8C18.5 15.8 12 20 12 20z" />,
        27,
      )
    case 'fiestas': // ster
      return svg(
        <path d="M12 3.5l2.4 5.6 6 .5-4.6 3.9 1.5 5.9L12 16.6 6.7 19.4l1.5-5.9L3.6 9.6l6-.5z" />,
      )
    case 'suenos': // koffertje
      return svg(
        <>
          <rect x="3" y="8" width="18" height="12" rx="2.2" />
          <path d="M8 8V6.2A2.2 2.2 0 0 1 10.2 4h3.6A2.2 2.2 0 0 1 16 6.2V8" />
          <path d="M3 13h18" />
        </>,
        27,
      )
    default:
      return svg(<circle cx="12" cy="12" r="8" />)
  }
}

const CHECK_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l5 5L20 6" />
  </svg>
)

/* --- Eiland-item in de hoofdstuk-detailweergave --- */
function IslandItem({ unitInfo, index, status, clickable }) {
  const unit = unitInfo.unit
  const cfg = ART[unit.illustration] || ART_FALLBACK
  const offset = ISLAND_OFFSETS[index % ISLAND_OFFSETS.length]
  const isDone = status === 'done'
  const isCurrent = status === 'current'
  const isLater = status === 'later'

  const inner = (
    <>
      {isCurrent && (
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            background: '#fff',
            color: 'var(--accent)',
            fontFamily: 'var(--font-head)',
            fontWeight: 800,
            fontSize: 11,
            padding: '5px 12px',
            borderRadius: 12,
            boxShadow: '0 6px 14px rgba(20,22,58,.2)',
            whiteSpace: 'nowrap',
            animation: 'floaty 2.6s ease-in-out infinite',
          }}
        >
          START ▸
        </div>
      )}
      <div style={{ position: 'relative', width: 188, height: 150 }}>
        {isCurrent && (
          <div
            style={{
              position: 'absolute',
              bottom: 34,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 150,
              height: 82,
              borderRadius: '50%',
              background: 'var(--accent)',
              opacity: 0.28,
              animation: 'pulseRing 1.8s ease-out infinite',
              zIndex: 0,
            }}
          />
        )}
        <img
          src={asset('island.png')}
          alt=""
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 188,
            pointerEvents: 'none',
            zIndex: 1,
            filter: 'drop-shadow(0 10px 10px rgba(0,0,0,.12))',
          }}
        />
        <img
          src={asset(unit.illustration)}
          alt=""
          style={{
            position: 'absolute',
            top: cfg.top,
            left: '50%',
            transform: 'translateX(-50%)',
            width: cfg.w,
            zIndex: 2,
            pointerEvents: 'none',
            filter: isLater ? 'saturate(.6)' : 'none',
            opacity: isLater ? 0.85 : 1,
          }}
        />
        {isDone && (
          <div
            style={{
              position: 'absolute',
              right: 30,
              top: 34,
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: '#3FB27F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 8px rgba(0,0,0,.25)',
              zIndex: 3,
            }}
          >
            {CHECK_SVG}
          </div>
        )}
      </div>
      <div
        style={{
          marginTop: 8,
          background: '#C98A46',
          border: '2px solid #a86f34',
          color: '#fff',
          fontFamily: 'var(--font-head)',
          fontWeight: 700,
          fontSize: 12.5,
          padding: '6px 16px',
          borderRadius: 22,
          boxShadow: '0 4px 0 #8a5a28',
          whiteSpace: 'nowrap',
        }}
      >
        {unit.subtitleNl}
      </div>
    </>
  )

  const wrapStyle = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transform: `translateX(${offset}px)`,
    marginTop: index === 0 ? 30 : 140,
    textDecoration: 'none',
    zIndex: 1,
  }

  if (clickable) {
    return (
      <Link
        to={`/session/${unit.id}/${firstStepId(unitInfo)}`}
        aria-label={unit.subtitleNl}
        onClick={playClick}
        style={{ ...wrapStyle, cursor: 'pointer' }}
      >
        {inner}
      </Link>
    )
  }
  return (
    <div aria-label={unit.subtitleNl} style={{ ...wrapStyle, cursor: 'default' }}>
      {inner}
    </div>
  )
}

/* --- Knoop in het hoofdstukken-overzicht ("Jouw reis") --- */
function ChapterNode({ info, top, left, onOpen }) {
  const { chapter, status } = info
  const isCurrent = status === 'current'
  const isComplete = status === 'complete'

  let box
  if (isComplete) {
    box = {
      w: 64,
      radius: 20,
      background: '#3FB27F',
      boxShadow: '0 6px 0 #2f8f65',
      icon: '#fff',
    }
  } else if (isCurrent) {
    box = {
      w: 72,
      radius: 22,
      background: 'var(--accent)',
      boxShadow: '0 7px 0 var(--accent-deep)',
      icon: '#fff',
    }
  } else {
    box = {
      w: 64,
      radius: 20,
      background: '#E1E0EF',
      boxShadow: '0 6px 0 #C9C7DE',
      icon: '#9998BE',
    }
  }

  const knob = (
    <div style={{ position: 'relative', width: box.w, height: box.w, margin: '0 auto' }}>
      {isCurrent && (
        <>
          <div
            style={{
              position: 'absolute',
              top: -26,
              left: '50%',
              transform: 'translateX(-50%)',
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
              zIndex: 2,
            }}
          >
            START ▸
          </div>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: box.radius,
              background: 'var(--accent)',
              opacity: 0.5,
              animation: 'pulseRing 1.8s ease-out infinite',
            }}
          />
        </>
      )}
      <div
        style={{
          position: 'relative',
          width: box.w,
          height: box.w,
          borderRadius: box.radius,
          background: box.background,
          boxShadow: box.boxShadow,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ChapterIcon theme={chapter.theme} color={box.icon} />
      </div>
    </div>
  )

  const label = (
    <p
      style={{
        margin: '8px auto 0',
        maxWidth: 96,
        lineHeight: 1.1,
        fontWeight: 800,
        fontSize: isCurrent ? 12 : 11,
        fontFamily: isCurrent ? 'var(--font-head)' : 'inherit',
        color: isCurrent ? 'var(--accent)' : isComplete ? '#5A5A78' : '#B0AFCB',
      }}
    >
      {chapter.title}
    </p>
  )

  const wrap = { position: 'absolute', top, left, transform: 'translateX(-50%)', textAlign: 'center' }

  if (info.openable) {
    return (
      <button
        type="button"
        aria-label={chapter.title}
        onClick={() => {
          playClick()
          onOpen(info.index)
        }}
        style={{ ...wrap, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
      >
        {knob}
        {label}
      </button>
    )
  }
  return (
    <div style={wrap} aria-label={chapter.title}>
      {knob}
      {label}
    </div>
  )
}

const DETAIL_BG = 'linear-gradient(180deg,#BCE39C 0%,#D4E9AE 34%,#ECE6C4 66%,#E7D3A2 100%)'

// Zigzag-positie in het overzicht: eerste en laatste gecentreerd, tussenin links/rechts.
function overviewLeft(index, total) {
  if (index === 0 || index === total - 1) return '50%'
  return index % 2 === 1 ? '32.5%' : '67.5%'
}
const OVERVIEW_TOP0 = 28
const OVERVIEW_RHYTHM = 88

function AdminNote() {
  return (
    <p
      style={{
        margin: '14px 20px 0',
        textAlign: 'center',
        color: 'var(--accent)',
        fontWeight: 800,
        fontSize: 11.5,
        letterSpacing: '.04em',
      }}
    >
      ADMIN · alle lessen ontgrendeld
    </p>
  )
}

export default function LearningPath() {
  const episodes = useStore((s) => s.episodes)
  const unlockAll = useStore((s) => s.settings.unlockAll)
  const [ladder, setLadder] = useState(null)
  const [view, setView] = useState('detail') // 'detail' | 'overview'
  const [selectedChapter, setSelectedChapter] = useState(null)

  useEffect(() => {
    loadLadder().then(setLadder).catch(() => setLadder({ units: [], chapters: [] }))
  }, [])

  const progress = ladder ? computeProgress(ladder, episodes) : null
  if (progress && unlockAll) unlockProgress(progress)
  const chapterData = ladder ? computeChapters(ladder, progress, unlockAll) : null

  // Standaard opent het Leerpad op de detailweergave van het huidige hoofdstuk.
  useEffect(() => {
    if (chapterData && selectedChapter === null) setSelectedChapter(chapterData.currentChapterIndex)
  }, [chapterData, selectedChapter])

  if (!chapterData) {
    return (
      <div className="screen" style={{ background: DETAIL_BG }}>
        <div className="screen__scroll" />
        <TabBar variant="light" />
      </div>
    )
  }

  const chapters = ladder.chapters || []
  const activeIndex = selectedChapter ?? chapterData.currentChapterIndex
  const activeInfo = chapterData.infos[activeIndex] || chapterData.infos[chapterData.currentChapterIndex]
  const completeCount = chapterData.infos.filter((c) => c.complete).length

  /* ===== Overzicht ("Jouw reis") ===== */
  if (view === 'overview') {
    const total = chapters.length
    return (
      <div className="screen screen--page">
        <div className="screen__scroll">
          <div className="brand-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, color: 'var(--brand-soft)', fontWeight: 800, fontSize: 11, letterSpacing: '.08em' }}>
                  LEERPAD
                </p>
                <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20 }}>
                  Jouw reis
                </p>
              </div>
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.13)', borderRadius: 16, padding: '8px 12px' }}>
                <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 16 }}>
                  {completeCount}/{total}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: 9.5, fontWeight: 700, color: 'var(--brand-soft)' }}>
                  hoofdstukken
                </p>
              </div>
            </div>
          </div>

          {unlockAll && <AdminNote />}

          <div style={{ position: 'relative', minHeight: OVERVIEW_TOP0 + total * OVERVIEW_RHYTHM + 60 }}>
            {chapterData.infos.map((info) => (
              <ChapterNode
                key={info.chapter.id}
                info={info}
                top={OVERVIEW_TOP0 + info.index * OVERVIEW_RHYTHM}
                left={overviewLeft(info.index, total)}
                onOpen={(idx) => {
                  setSelectedChapter(idx)
                  setView('detail')
                }}
              />
            ))}
          </div>
        </div>

        <TabBar variant="light" />
      </div>
    )
  }

  /* ===== Hoofdstuk-detail ===== */
  const chapterNr = activeIndex + 1
  const chapterTitle = activeInfo?.chapter.title || ''
  const units = activeInfo?.units || []

  // Lokale unit-status binnen dit hoofdstuk: done / current (eerste niet-af) / later.
  const firstIncompleteInChapter = units.findIndex((u) => !u.unitComplete)
  const unitStatus = (u, i) => {
    if (u.unitComplete) return 'done'
    if (i === firstIncompleteInChapter) return 'current'
    return 'later'
  }
  // done + current altijd klikbaar; latere units alleen in admin-stand.
  const unitClickable = (status) => status === 'done' || status === 'current' || unlockAll

  const prevIndex = activeIndex - 1
  const nextIndex = activeIndex + 1
  const prevInfo = prevIndex >= 0 ? chapterData.infos[prevIndex] : null
  const nextInfo = nextIndex < chapters.length ? chapterData.infos[nextIndex] : null
  const showNext = nextInfo && (unlockAll || nextInfo.hasUnits)

  return (
    <div className="screen" style={{ background: DETAIL_BG }}>
      <div className="screen__scroll">
        <div style={{ position: 'relative', padding: '10px 16px 30px' }}>
          {/* Wolk-blobs op de achtergrond */}
          <div style={{ position: 'absolute', left: 22, top: 26, width: 72, height: 24, borderRadius: 20, background: 'rgba(255,255,255,.7)' }} />
          <div style={{ position: 'absolute', left: 44, top: 16, width: 44, height: 20, borderRadius: 20, background: 'rgba(255,255,255,.7)' }} />
          <div style={{ position: 'absolute', right: 26, top: 150, width: 58, height: 20, borderRadius: 20, background: 'rgba(255,255,255,.6)' }} />
          <div style={{ position: 'absolute', left: 30, top: 400, width: 60, height: 20, borderRadius: 20, background: 'rgba(255,255,255,.55)' }} />

          {/* Kop + tikbaar element naar het overzicht */}
          <div style={{ position: 'relative', textAlign: 'center', padding: '4px 0 6px' }}>
            <button
              type="button"
              onClick={() => {
                playClick()
                setView('overview')
              }}
              aria-label="Naar hoofdstukkenoverzicht"
              style={{
                position: 'absolute',
                right: 4,
                top: 2,
                border: 'none',
                background: 'rgba(255,255,255,.6)',
                color: '#5f6b4e',
                fontWeight: 800,
                fontSize: 11,
                padding: '6px 12px',
                borderRadius: 20,
                cursor: 'pointer',
              }}
            >
              Jouw reis ▸
            </button>
            <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 19, color: '#33502F' }}>
              Leerpad
            </p>
            <p style={{ margin: '2px 0 0', fontWeight: 800, fontSize: 11, color: '#6f8a5e' }}>
              Hoofdstuk {chapterNr} · {chapterTitle}
            </p>
          </div>

          {unlockAll && <AdminNote />}

          {/* Eilanden */}
          {units.length > 0 ? (
            <div style={{ position: 'relative', zIndex: 1 }}>
              {units.map((u, i) => {
                const status = unitStatus(u, i)
                return (
                  <IslandItem
                    key={u.unit.id}
                    unitInfo={u}
                    index={i}
                    status={status}
                    clickable={unitClickable(status)}
                  />
                )
              })}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: '#5f6b4e', fontWeight: 800, marginTop: 60 }}>
              Binnenkort meer
            </p>
          )}

          {/* Navigatie tussen hoofdstukken */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 34 }}>
            {showNext && (
              <button
                type="button"
                onClick={() => {
                  playClick()
                  setSelectedChapter(nextIndex)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  background: 'var(--accent)',
                  borderRadius: 20,
                  padding: '9px 18px',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 12,
                  boxShadow: '0 4px 0 var(--accent-deep)',
                  cursor: 'pointer',
                }}
              >
                Volgende: {nextInfo.chapter.title} ▸
              </button>
            )}
            {prevInfo && (
              <button
                type="button"
                onClick={() => {
                  playClick()
                  setSelectedChapter(prevIndex)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  background: 'rgba(255,255,255,.6)',
                  borderRadius: 20,
                  padding: '9px 18px',
                  color: '#5f6b4e',
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ◂ Terug: {prevInfo.chapter.title}
              </button>
            )}
          </div>
        </div>
      </div>

      <TabBar variant="light" />
    </div>
  )
}
