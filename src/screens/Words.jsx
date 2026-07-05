import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { dueItems, isDue, todayStr } from '../lib/srs'
import TabBar from '../components/TabBar.jsx'
import '../overview.css'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function daysUntil(dueDate) {
  const today = new Date(todayStr() + 'T12:00:00')
  const due = new Date(dueDate + 'T12:00:00')
  return Math.round((due - today) / 86400000)
}

/* Bouw meerkeuze-opties: juiste NL + tot 3 unieke distractors uit andere srs-woorden. */
function buildOptions(item, allNl) {
  const pool = shuffle([...new Set(allNl.filter((n) => n !== item.nl))]).slice(0, 3)
  return shuffle([item.nl, ...pool])
}

export default function Words() {
  const srs = useStore((s) => s.srs)
  const srsReview = useStore((s) => s.srsReview)

  const items = useMemo(() => Object.values(srs), [srs])
  const due = useMemo(() => dueItems(srs), [srs])
  const totalCount = items.length

  // Inline herhaalsessie
  const [session, setSession] = useState(null) // { questions, index, selected, correctCount, done }

  function startSession() {
    const allNl = items.map((i) => i.nl)
    const questions = due.map((item) => ({
      key: item.es,
      es: item.es,
      nl: item.nl,
      options: buildOptions(item, allNl),
    }))
    if (!questions.length) return
    setSession({ questions, index: 0, selected: null, correctCount: 0, done: false })
  }

  function answer(option) {
    if (session.selected != null) return
    const q = session.questions[session.index]
    const correct = option === q.nl
    srsReview(q.key, correct)
    setSession((s) => ({ ...s, selected: option, correctCount: s.correctCount + (correct ? 1 : 0) }))
  }

  function next() {
    setSession((s) => {
      const nextIndex = s.index + 1
      if (nextIndex >= s.questions.length) return { ...s, done: true }
      return { ...s, index: nextIndex, selected: null }
    })
  }

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)),
    [items],
  )

  // --- Render: actieve sessie ---
  if (session && !session.done) {
    const q = session.questions[session.index]
    const answered = session.selected != null
    return (
      <div className="screen screen--page">
        <div className="screen__scroll" style={{ padding: '20px 20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
              Herhalen
            </p>
            <span style={{ color: 'var(--ink-mute)', fontWeight: 800, fontSize: 13 }}>
              {session.index + 1} / {session.questions.length}
            </span>
          </div>

          <div className="card" style={{ marginTop: 16, padding: 20, textAlign: 'center' }}>
            <p style={{ margin: 0, color: 'var(--ink-mute)', fontWeight: 700, fontSize: 12 }}>Wat betekent</p>
            <p style={{ margin: '8px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 26, color: 'var(--ink)' }}>
              {q.es}
            </p>
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.options.map((opt) => {
              let border = '2px solid var(--line)'
              let bg = '#fff'
              let color = 'var(--ink)'
              if (answered) {
                if (opt === q.nl) {
                  border = '2px solid var(--good)'
                  bg = 'var(--good)'
                  color = '#fff'
                } else if (opt === session.selected) {
                  border = '2px solid var(--accent)'
                  bg = 'var(--accent)'
                  color = '#fff'
                }
              }
              return (
                <button
                  key={opt}
                  onClick={() => answer(opt)}
                  disabled={answered}
                  style={{
                    border,
                    background: bg,
                    color,
                    borderRadius: 14,
                    padding: '14px 16px',
                    fontFamily: 'var(--font-head)',
                    fontWeight: 800,
                    fontSize: 15,
                    textAlign: 'left',
                    minHeight: 48,
                    cursor: answered ? 'default' : 'pointer',
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>

          {answered && (
            <div style={{ marginTop: 16 }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-head)',
                  fontWeight: 800,
                  fontSize: 17,
                  color: session.selected === q.nl ? 'var(--good)' : 'var(--accent)',
                }}
              >
                {session.selected === q.nl ? '¡Correcto!' : `Bijna: ${q.es} = ${q.nl}`}
              </p>
              <button className="btn-accent" style={{ marginTop: 14 }} onClick={next}>
                {session.index + 1 >= session.questions.length ? 'Afronden ▸' : 'Volgende ▸'}
              </button>
            </div>
          )}
        </div>
        <TabBar variant="light" />
      </div>
    )
  }

  // --- Render: samenvatting ---
  if (session && session.done) {
    const y = session.questions.length
    return (
      <div className="screen screen--page">
        <div className="screen__scroll" style={{ padding: '20px 20px 24px' }}>
          <div className="card" style={{ marginTop: 40, padding: 24, textAlign: 'center' }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'var(--good)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 24px rgba(63,178,127,.4)',
              }}
            >
              <span style={{ color: '#fff', fontSize: 40, fontWeight: 800 }}>✓</span>
            </div>
            <p style={{ margin: '16px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 24, color: 'var(--ink)' }}>
              Klaar!
            </p>
            <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', fontWeight: 700, fontSize: 15 }}>
              {session.correctCount} van {y} goed
            </p>
            <button className="btn-accent" style={{ marginTop: 20 }} onClick={() => setSession(null)}>
              Terug naar woorden
            </button>
          </div>
        </div>
        <TabBar variant="light" />
      </div>
    )
  }

  // --- Render: overzicht ---
  return (
    <div className="screen screen--page">
      <div className="screen__scroll">
        <div className="brand-header">
          <p style={{ margin: 0, color: 'var(--brand-soft)', fontWeight: 800, fontSize: 11, letterSpacing: '.08em' }}>
            {totalCount} {totalCount === 1 ? 'WOORD' : 'WOORDEN'}
          </p>
          <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 24 }}>
            Mijn woorden
          </p>
        </div>

        <div style={{ padding: '18px 20px 24px' }}>
          {/* Te-herhalen-kaart */}
          <div className="card" style={{ padding: 18 }}>
            <p style={{ margin: 0, color: 'var(--ink-mute)', fontWeight: 700, fontSize: 12 }}>Te herhalen</p>
            <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 22, color: 'var(--ink)' }}>
              {due.length} {due.length === 1 ? 'woord' : 'woorden'}
            </p>
            <button className="btn-accent" style={{ marginTop: 14 }} disabled={due.length === 0} onClick={startSession}>
              Herhaal nu
            </button>
          </div>

          {/* Woordenlijst */}
          {totalCount === 0 ? (
            <div className="card" style={{ marginTop: 18, padding: 22, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 34 }}>📚</p>
              <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>
                Nog geen woorden
              </p>
              <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 14, lineHeight: 1.5 }}>
                Leer de woorden in een aflevering, dan komen ze hier terecht om te herhalen.
              </p>
            </div>
          ) : (
            <div style={{ marginTop: 22 }}>
              <p style={{ margin: '0 4px 10px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                Alle woorden
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedItems.map((item) => {
                  const due_ = isDue(item)
                  const d = daysUntil(item.dueDate)
                  return (
                    <div
                      key={item.es}
                      className="card"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 15px',
                        boxShadow: 'none',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
                          {item.es}
                        </p>
                        <p style={{ margin: '2px 0 0', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 13 }}>
                          {item.nl}
                        </p>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          fontWeight: 800,
                          fontSize: 12,
                          color: due_ ? 'var(--accent)' : 'var(--ink-faint)',
                        }}
                      >
                        {due_ ? 'nu' : `over ${d} ${d === 1 ? 'dag' : 'dagen'}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <TabBar variant="light" />
    </div>
  )
}
