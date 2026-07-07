import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { dueCards, cardsWithNotes, dueInDays } from '../lib/cards'
import { playClick } from '../lib/sounds'
import { playCardAudio } from '../lib/speak'
import VocabExercise from '../components/VocabExercise.jsx'
import TabBar from '../components/TabBar.jsx'
import '../overview.css'
import '../session.css'

export default function Words() {
  const engine = useStore((s) => s.engine)
  const streak = useStore((s) => s.streak)
  const engineReview = useStore((s) => s.engineReview)
  const engineMaybeIntroduceProduction = useStore((s) => s.engineMaybeIntroduceProduction)

  // Bij het openen: productiekaarten aanmaken die aan hun fasering toe zijn.
  useEffect(() => {
    engineMaybeIntroduceProduction()
  }, [engineMaybeIntroduceProduction])

  const due = useMemo(() => dueCards(engine), [engine])
  const allCards = useMemo(() => cardsWithNotes(engine), [engine])
  const noteCount = Object.keys(engine.notes).length

  // NL-distractors voor de meerkeuze (herkenning).
  const pool = useMemo(() => Object.values(engine.notes).map((n) => n.nl), [engine])

  // Inline herhaalsessie op de engine (zelfde oefenvormen als de woordles).
  const [session, setSession] = useState(null) // { cards, pos, correctCount, done }
  const reviewedRef = useRef(new Set())

  function startSession() {
    const cards = dueCards(useStore.getState().engine)
    if (!cards.length) return
    reviewedRef.current = new Set()
    setSession({ cards, pos: 0, correctCount: 0, done: false })
    const first = cards[0]
    if (first.direction === 'recognition') playCardAudio(useStore.getState().engine.notes[first.noteId])
  }

  function onGraded(correct) {
    const cardRec = session.cards[session.pos]
    if (!reviewedRef.current.has(cardRec.id)) {
      engineReview(cardRec.id, correct)
      reviewedRef.current.add(cardRec.id)
    }
    setItemChecked(true)
    if (correct) setSession((s) => ({ ...s, correctCount: s.correctCount + 1 }))
  }

  function onContinue() {
    setItemChecked(false)
    setSession((s) => {
      const nextPos = s.pos + 1
      if (nextPos >= s.cards.length) return { ...s, done: true }
      const nextCard = s.cards[nextPos]
      if (nextCard.direction === 'recognition')
        playCardAudio(useStore.getState().engine.notes[nextCard.noteId])
      return { ...s, pos: nextPos }
    })
  }

  // --- Render: actieve herhaalsessie (donkere sessie-shell) ---
  if (session && !session.done) {
    const cardRec = session.cards[session.pos]
    const note = engine.notes[cardRec.noteId]
    const fill = (((session.pos + 1) / session.cards.length) * 100).toFixed(1)
    return (
      <div className="session" key={'rev-' + session.pos}>
        <div className="s-header">
          <button className="s-iconbtn" onClick={() => setSession(null)} aria-label="Sluiten">
            ✕
          </button>
          <div className="s-progress green">
            <i style={{ width: fill + '%' }} />
          </div>
          <span className="s-streak" aria-label="Streak">
            <span className="fire">🔥</span>
            {streak.current}
          </span>
        </div>
        <div className="s-body">
          <VocabExercise
            key={cardRec.id + ':' + session.pos}
            direction={cardRec.direction}
            note={note}
            mode="mc"
            pool={pool}
            glossaryValues={[]}
            onGraded={onGraded}
            onContinue={onContinue}
            continueLabel={session.pos + 1 >= session.cards.length ? 'Afronden ▸' : 'Doorgaan ▸'}
          />
        </div>
      </div>
    )
  }

  // --- Render: samenvatting ---
  if (session && session.done) {
    const y = session.cards.length
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
          <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 22 }}>Woorden</p>
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,.12)', borderRadius: 16, padding: '12px 14px' }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20 }}>{due.length}</p>
              <p style={{ margin: '1px 0 0', color: 'var(--brand-soft)', fontWeight: 700, fontSize: 11 }}>te herhalen</p>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,.12)', borderRadius: 16, padding: '12px 14px' }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20 }}>{noteCount}</p>
              <p style={{ margin: '1px 0 0', color: 'var(--brand-soft)', fontWeight: 700, fontSize: 11 }}>geleerd</p>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 20px 24px' }}>
          {/* Herhaalsessie starten */}
          <button
            className="btn-accent"
            style={{ marginBottom: 16 }}
            disabled={due.length === 0}
            onClick={() => { playClick(); startSession() }}
          >
            Start herhaalsessie ▸
          </button>

          {/* Woordenlijst */}
          {allCards.length === 0 ? (
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
              <p style={{ margin: '0 4px 10px', fontWeight: 800, fontSize: 11, letterSpacing: '.05em', color: 'var(--ink-mute)' }}>
                JOUW STAPEL
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allCards.map(({ card, note }) => {
                  const d = dueInDays(card)
                  const isDue = d <= 0
                  return (
                    <div
                      key={card.id}
                      className="card"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 15px',
                        boxShadow: '0 8px 20px -14px rgba(20,40,90,.4)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16, color: 'var(--brand)' }}>
                          {note.es}
                        </p>
                        <p style={{ margin: '2px 0 0', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 13 }}>
                          {note.nl}
                          <span style={{ color: 'var(--ink-faint)', fontWeight: 700 }}>
                            {' · '}
                            {card.direction === 'production' ? 'NL→ES' : 'luister'}
                          </span>
                        </p>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          fontWeight: 800,
                          fontSize: 12,
                          color: isDue ? 'var(--accent)' : 'var(--ink-faint)',
                        }}
                      >
                        {isDue ? 'nu' : `over ${d} ${d === 1 ? 'dag' : 'dagen'}`}
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
