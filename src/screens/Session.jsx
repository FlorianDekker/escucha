import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore, XP_PER_CORRECT, XP_PER_TRY } from '../lib/store'
import { loadLadder, loadEpisode, normalizeWord } from '../lib/contentLoader'
import { dueCards } from '../lib/cards'
import { useSegmentPlayer } from '../lib/audio'
import { playClick, playCorrect, playWrong } from '../lib/sounds'
import { playWord, playCardAudio } from '../lib/speak'
import QuestionCard from '../components/QuestionCard.jsx'
import TranscriptBubbles from '../components/TranscriptBubbles.jsx'
import VocabExercise from '../components/VocabExercise.jsx'
import SegmentPlayer from '../components/SegmentPlayer.jsx'
import '../session.css'

const RATES = [0.75, 1, 1.25]

/* Bewijsfragment onder de feedback: de zin waarin het antwoord zat, terug te
   luisteren met NL-vertaling ernaast. */
function EvidenceCard({ evidence, onPlay }) {
  if (!evidence || evidence.startSec == null) return null
  return (
    <div className="answer-card">
      <p className="lbl">HIER HOORDE JE HET</p>
      <div className="evidence-row">
        <button type="button" className="evidence-play" onClick={onPlay} aria-label="Speel het fragment">
          <span />
        </button>
        <div>
          <p className="evidence-es">{evidence.es}</p>
          <p className="evidence-nl">{evidence.nl}</p>
        </div>
      </div>
    </div>
  )
}

export default function Session() {
  const { unitId, stepId } = useParams()
  const navigate = useNavigate()

  const [ladder, setLadder] = useState(null)
  const [episode, setEpisode] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setError(null)
    setLadder(null)
    setEpisode(null)
    ;(async () => {
      try {
        const l = await loadLadder()
        if (!alive) return
        setLadder(l)
        const unit = l.units.find((u) => u.id === unitId)
        if (!unit) throw new Error('Deze les bestaat niet.')
        const podcastId = unit.episodeId.split('-')[0]
        const ep = await loadEpisode(podcastId, unit.episodeId)
        if (!alive) return
        setEpisode(ep)
      } catch (e) {
        if (alive) setError(e.message || 'Er ging iets mis bij het laden.')
      }
    })()
    return () => {
      alive = false
    }
  }, [unitId])

  if (error) {
    return (
      <div className="session">
        <div className="s-status">
          <div style={{ fontSize: 44 }}>😕</div>
          <p>Laden lukt niet</p>
          <small>{error}</small>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 22 }}
            onClick={() => navigate('/path')}
          >
            Terug naar het leerpad
          </button>
        </div>
      </div>
    )
  }

  if (!ladder || !episode) {
    return (
      <div className="session">
        <div className="s-status">
          <div style={{ fontSize: 44, animation: 'floaty 2.6s ease-in-out infinite' }}>🎧</div>
          <p>Aan het laden…</p>
        </div>
      </div>
    )
  }

  const unit = ladder.units.find((u) => u.id === unitId)
  const step = unit?.steps.find((s) => s.id === stepId)

  if (!step) {
    return (
      <div className="session">
        <div className="s-status">
          <div style={{ fontSize: 44 }}>😕</div>
          <p>Deze stap bestaat niet</p>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 22 }}
            onClick={() => navigate('/path')}
          >
            Terug naar het leerpad
          </button>
        </div>
      </div>
    )
  }

  const episodeId = episode.id
  const podcast = ladder.podcasts?.[episode.podcastId]
  const common = { episode, unit, step, episodeId, podcast, navigate }

  if (step.type === 'words') return <WordsFlow key={stepId} {...common} />
  if (step.type === 'listen') return <ListenFlow key={stepId} {...common} />
  if (step.type === 'read') return <ListenFlow key={stepId} {...common} reading />
  if (step.type === 'gate') return <GateFlow key={stepId} {...common} />

  return null
}

/* ============================================================
   A) WORDS  ·  intro (scherm 3) -> woordoefening (scherm 4)
   ============================================================ */
function WordsFlow({ episode, step, episodeId, podcast, navigate }) {
  const completeStep = useStore((s) => s.completeStep)
  const streak = useStore((s) => s.streak)
  const engineReview = useStore((s) => s.engineReview)

  const [phase, setPhase] = useState('intro')
  const [mode, setMode] = useState('mc') // 'mc' | 'type' (alleen herkenning)
  const [itemChecked, setItemChecked] = useState(false)

  // De studeer-wachtrij. Elke entry = { cardId, phase: 'acquire' | 'review' }.
  //  - acquire: nieuw kernwoord (herkenning). Moet 2x goed binnen de sessie.
  //  - review: een due kaart (herkenning of productie) van eerdere afleveringen.
  const [queue, setQueue] = useState([])
  const [pos, setPos] = useState(0)
  const [initialCount, setInitialCount] = useState(0)

  // correctCounts: goede antwoorden per kaart deze sessie (acquisitie-teller).
  // resolved: kaarten die klaar zijn (acquire 2x goed, of review 1x behandeld).
  const [correctCounts, setCorrectCounts] = useState({})
  const [resolved, setResolved] = useState(() => new Set())
  // Kaarten die al één FSRS-review kregen deze sessie (eerste poging telt).
  const reviewedRef = useRef(new Set())
  const attemptsRef = useRef({})

  const engine = useStore((s) => s.engine)
  const entry = queue[pos]
  const card = entry ? engine.cards[entry.cardId] : null
  const note = card ? engine.notes[card.noteId] : null

  const pool = useMemo(
    () => Object.values(engine.notes).map((n) => n.nl),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase],
  )
  const glossaryValues = useMemo(() => Object.values(episode.glossary || {}), [episode])

  // Vraagkant-audio afspelen binnen een klik (herkenning). Productie toont NL-tekst.
  // eng meegeven omdat de store net bijgewerkt kan zijn (nieuwe notes/kaarten).
  function speakQuestion(c, eng = engine) {
    if (!c) return
    if (c.direction === 'recognition') playCardAudio(eng.notes[c.noteId])
  }

  // ---- Sessie opbouwen (binnen de "Leer de woorden"-klik) ----
  function startExercise() {
    const store = useStore.getState()
    // Productiekaarten aanmaken die aan hun fasering toe zijn.
    store.engineMaybeIntroduceProduction()
    // Kernwoorden introduceren (maakt de herkenningskaarten aan).
    const core = episode.vocab.filter((v) => v.core)
    const coreIds = new Set()
    for (const v of core) {
      store.engineIntroduceNote({
        es: v.es,
        nl: v.nl,
        exampleEs: v.exampleEs,
        clip: v.clip,
        audioUrl: episode.audioUrl,
        sourceEpisodeId: episodeId,
      })
      coreIds.add(normalizeWord(v.es))
    }
    const eng = useStore.getState().engine
    const acquire = [...coreIds].map((id) => ({ cardId: id + ':recognition', phase: 'acquire' }))
    const review = []
    for (const c of dueCards(eng)) {
      if (coreIds.has(c.noteId)) continue
      review.push({ cardId: c.id, phase: 'review' })
      if (review.length >= 6) break
    }
    const q = [...acquire, ...review]
    setQueue(q)
    setInitialCount(q.length)
    setPos(0)
    setPhase('exercise')
    // Eerste vraag-audio binnen deze klik afspelen.
    const first = q[0] && eng.cards[q[0].cardId]
    speakQuestion(first, eng)
  }

  // ---- Eén beoordeling (eerste poging = de FSRS-review) ----
  function onGraded(correct) {
    if (!entry) return
    const id = entry.cardId
    if (!reviewedRef.current.has(id)) {
      engineReview(id, correct)
      reviewedRef.current.add(id)
    }
    setItemChecked(true)
    if (entry.phase === 'review') {
      setResolved((r) => new Set(r).add(id))
    } else if (correct) {
      setCorrectCounts((c) => {
        const nextCount = (c[id] || 0) + 1
        if (nextCount >= 2) setResolved((r) => new Set(r).add(id))
        return { ...c, [id]: nextCount }
      })
    }
  }

  // ---- Doorgaan: re-queue bij acquisitie, anders vooruit ----
  function onContinue() {
    if (!entry) return
    const id = entry.cardId
    attemptsRef.current[id] = (attemptsRef.current[id] || 0) + 1

    let q = queue
    const acquired = (correctCounts[id] || 0) >= 2
    const tooMany = attemptsRef.current[id] >= 6 // veiligheidsklep tegen eindeloos herhalen
    if (entry.phase === 'acquire' && !acquired && !tooMany) {
      // Opnieuw inplannen met minimaal 2 andere items ertussen.
      q = [...queue]
      const insertAt = Math.min(pos + 3, q.length)
      q.splice(insertAt, 0, entry)
      setQueue(q)
    }

    const nextPos = pos + 1
    setItemChecked(false)
    if (nextPos >= q.length) {
      completeStep(episodeId, step.id)
      navigate('/path')
      return
    }
    setPos(nextPos)
    // Vraag-audio van de volgende kaart binnen deze klik.
    const eng = useStore.getState().engine
    const nextEntry = q[nextPos]
    speakQuestion(nextEntry && eng.cards[nextEntry.cardId], eng)
  }

  // ---- Intro (scherm 3) ----
  if (phase === 'intro') {
    const minutes = Math.round(episode.durationSec / 60)
    const meta = `${episode.segments.length} fragmenten · ${minutes} min · ${episode.vocab.length} woorden`
    return (
      <div className="session" key="intro">
        <div className="s-header">
          <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Terug">
            ‹
          </button>
          <span className="s-title" />
          <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Sluiten">
            ✕
          </button>
        </div>

        <div
          className="intro-art"
          style={
            podcast?.artUrl
              ? {
                  backgroundImage: `url(${import.meta.env.BASE_URL}${podcast.artUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        />
        <p className="intro-kicker">PODCAST · {episode.level}</p>
        <p className="intro-title">{episode.title}</p>
        <p className="intro-meta">{meta}</p>

        <div className="intro-sheet">
          <p className="intro-desc">{episode.descriptionNl}</p>
          <p className="intro-h">Woorden in deze aflevering</p>
          <div className="word-list">
            {episode.vocab.map((v) => (
              <button key={v.id} type="button" className="word-row" onClick={() => playWord(v.es)}>
                <span className="word-es">
                  <i>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 9v6h4l5 4V5L8 9H4z" />
                      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
                    </svg>
                  </i>
                  {v.es}
                </span>
                <span className="word-nl">{v.nl}</span>
              </button>
            ))}
          </div>

          <div className="grow" />

          {episode.source?.attributionNl && (
            <p className="intro-attr">
              {episode.source.attributionNl}
              {episode.source.transcriptUrl && (
                <>
                  {' · '}
                  <a href={episode.source.transcriptUrl} target="_blank" rel="noreferrer">
                    transcript
                  </a>
                </>
              )}
            </p>
          )}

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => {
              playClick()
              startExercise()
            }}
          >
            Leer de woorden
          </button>
        </div>
      </div>
    )
  }

  // ---- Oefening (scherm 4) ----
  if (!entry || !card || !note) {
    // Niets te oefenen (geen kernwoorden en geen due kaarten). Zeldzaam;
    // markeer de stap als klaar via de knop (geen side effect tijdens render).
    return (
      <div className="session" key="empty">
        <div className="s-status">
          <div style={{ fontSize: 44 }}>✅</div>
          <p>Niets te oefenen hier</p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 22 }}
            onClick={() => {
              completeStep(episodeId, step.id)
              navigate('/path')
            }}
          >
            Terug naar het leerpad
          </button>
        </div>
      </div>
    )
  }
  const isProduction = card.direction === 'production'
  const fill = (initialCount ? (resolved.size / initialCount) * 100 : 0).toFixed(1)
  // Unieke sleutel per presentatie zodat de oefening bij re-queue opnieuw mount.
  const presentationKey = entry.cardId + ':' + pos
  return (
    <div className="session" key={'ex-' + pos}>
      <div className="s-header">
        <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Sluiten">
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
        {!isProduction && (
          <div className="mode-toggle">
            <button
              className={mode === 'mc' ? 'on' : ''}
              disabled={itemChecked}
              onClick={() => setMode('mc')}
            >
              Meerkeuze
            </button>
            <button
              className={mode === 'type' ? 'on' : ''}
              disabled={itemChecked}
              onClick={() => setMode('type')}
            >
              Typen
            </button>
          </div>
        )}

        <VocabExercise
          key={presentationKey}
          direction={card.direction}
          note={note}
          mode={mode}
          pool={pool}
          glossaryValues={glossaryValues}
          onGraded={onGraded}
          onContinue={onContinue}
          continueLabel={pos + 1 >= queue.length ? 'Afronden ▸' : 'Doorgaan ▸'}
        />
      </div>
    </div>
  )
}

/* ============================================================
   B) LISTEN  ·  luisteren (scherm 5) -> feedback (scherm 6)
   ============================================================ */
/*
 * reading=false: luister-eerst (transcript van het huidige fragment pas ná het
 * antwoord). reading=true (leesmodus): het transcript van het huidige fragment
 * leest live mee tijdens het luisteren, met de actieve zin uitgelicht.
 */
function ListenFlow({ episode, step, episodeId, navigate, reading = false }) {
  const answerSegment = useStore((s) => s.answerSegment)
  const completeStep = useStore((s) => s.completeStep)
  const setSegmentIndex = useStore((s) => s.setSegmentIndex)
  const rate = useStore((s) => s.settings.playbackRate)
  const setSetting = useStore((s) => s.setSetting)

  const segments = useMemo(
    () => step.segmentIds.map((id) => episode.segments.find((s) => s.id === id)).filter(Boolean),
    [episode, step],
  )

  // Hervatten: start op de voor déze stap opgeslagen index.
  const [idx, setIdx] = useState(() => {
    const si = useStore.getState().episodes[episodeId]?.segmentIndexByStep?.[step.id]
    return typeof si === 'number' && si >= 0 && si < segments.length ? si : 0
  })

  // Fase-machine per fragment: listen -> question(q1..qn) -> feedback.
  // question loopt met qIdx door alle vragen; feedback is één keer per fragment.
  // (seg.echo blijft inerte content voor het latere zinsdictee, zie docs/leerengine-spec.md §6.)
  const [phase, setPhase] = useState('listen') // listen | question | feedback | done
  const [qIdx, setQIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false) // in de vraagsheet: na Controleer kleuren tonen
  const [correct, setCorrect] = useState(false)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [qOutcomes, setQOutcomes] = useState([]) // per vraag: true/false
  const [results, setResults] = useState({}) // segId -> { good, total }

  const player = useSegmentPlayer(episode.audioUrl)
  const { playSegment, pause, resume, setRate, isPlaying, position, ended, error } = player

  const seg = segments[idx]

  // v2 backward compatible: één of meerdere vragen.
  const questions = seg.questions || (seg.question ? [seg.question] : [])
  const segTotal = questions.length

  const currentPart = { startSec: seg.startSec, endSec: seg.endSec }

  // Nieuw fragment -> alles resetten (nooit automatisch afspelen: iOS vereist een tap).
  useEffect(() => {
    setPhase('listen')
    setQIdx(0)
    setSelected(null)
    setRevealed(false)
    setCorrect(false)
    setHasPlayed(false)
    setQOutcomes([])
  }, [idx])

  // Auto-pauze: na het uitspelen van het fragment naar de vragen.
  useEffect(() => {
    if (!hasPlayed || !ended) return
    if (phase === 'listen') setPhase('question')
  }, [phase, hasPlayed, ended])

  function onToggle() {
    if (!seg) return
    if (isPlaying) {
      pause()
    } else {
      setHasPlayed(true)
      if (position > currentPart.startSec + 0.1 && position < currentPart.endSec - 0.05)
        resume(rate)
      else playSegment(currentPart.startSec, currentPart.endSec, rate)
    }
  }

  function onReplay() {
    if (!seg) return
    setHasPlayed(true)
    playSegment(currentPart.startSec, currentPart.endSec, rate)
  }

  function cycleRate() {
    const i = RATES.indexOf(rate)
    const nextRate = RATES[(i + 1) % RATES.length] ?? 1
    setSetting('playbackRate', nextRate)
    setRate(nextRate)
  }

  // Controleer een vraag: kleuren tonen en het antwoord meteen registreren.
  function check() {
    if (selected === null || revealed) return
    const q = questions[qIdx]
    const ok = selected === q.answerIndex
    if (ok) playCorrect()
    else playWrong()
    answerSegment(episodeId, seg.id + ':q' + (qIdx + 1), ok)
    setQOutcomes((o) => {
      const n = o.slice()
      n[qIdx] = ok
      return n
    })
    setCorrect(ok)
    setRevealed(true)
  }

  // Volgende vraag, of naar de feedback als dit de laatste was.
  function nextQuestion() {
    playClick()
    if (qIdx < questions.length - 1) {
      setQIdx((i) => i + 1)
      setSelected(null)
      setRevealed(false)
      setCorrect(false)
    } else {
      const good = qOutcomes.filter(Boolean).length
      setResults((r) => ({ ...r, [seg.id]: { good, total: segTotal } }))
      setPhase('feedback')
    }
  }

  function advance() {
    playClick()
    pause()
    if (idx >= segments.length - 1) {
      completeStep(episodeId, step.id)
      setSegmentIndex(episodeId, step.id, 0)
      setPhase('done')
    } else {
      const n = idx + 1
      setSegmentIndex(episodeId, step.id, n)
      setIdx(n)
    }
  }

  // Het hele fragment opnieuw: alle fasen van dit fragment resetten.
  function listenAgain() {
    pause()
    setPhase('listen')
    setQIdx(0)
    setSelected(null)
    setRevealed(false)
    setCorrect(false)
    setHasPlayed(false)
    setQOutcomes([])
  }

  const headerTitle = `${episode.title} · ${idx + 1}/${segments.length}`

  // ---- Afronding ----
  if (phase === 'done') {
    const outcomes = Object.values(results)
    const good = outcomes.reduce((a, r) => a + r.good, 0)
    const total = outcomes.reduce((a, r) => a + r.total, 0)
    const earnedXp = good * XP_PER_CORRECT + (total - good) * XP_PER_TRY
    return (
      <div className="session" key="done">
        <div className="s-header">
          <span className="s-iconbtn" style={{ visibility: 'hidden' }} />
          <span className="s-title">{step.labelNl || episode.title}</span>
          <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <div className="s-body center">
          <p className="result-emoji">🎉</p>
          <p className="result-title">Goed gedaan!</p>
          <p className="result-sub">
            Je had {good} van {total} oefeningen goed in dit deel.
          </p>
          <div className="xp-pill" style={{ marginTop: 16 }}>
            <i />+{earnedXp} XP
          </div>
          <div className="result-actions">
            <button type="button" className="btn btn-primary" onClick={() => navigate('/path')}>
              Naar het leerpad ▸
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Feedback (scherm 6): één keer per fragment, over alle 3 de oefeningen ----
  if (phase === 'feedback') {
    const good = results[seg.id]?.good ?? 0
    const total = results[seg.id]?.total ?? segTotal
    const allGood = good === total
    const earnedXp = good * XP_PER_CORRECT + (total - good) * XP_PER_TRY
    // Toon de juiste antwoorden van de fout beantwoorde vragen; was alles goed,
    // dan die van de laatste vraag.
    const wrong = questions.map((q, i) => ({ q, i })).filter(({ i }) => qOutcomes[i] === false)
    const shown = wrong.length
      ? wrong
      : [{ q: questions[questions.length - 1], i: questions.length - 1 }]
    return (
      <div className="session" key={'fb-' + idx}>
        <div className="s-header">
          <button className="s-iconbtn" onClick={listenAgain} aria-label="Terug">
            ‹
          </button>
          <span className="s-title" style={ellipsis}>
            {headerTitle}
          </span>
          <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Sluiten">
            ✕
          </button>
        </div>

        <div className="s-body">
          <div style={{ textAlign: 'center' }}>
            <div className={'fb-badge ' + (allGood ? 'ok' : 'casi')}>{allGood ? '✓' : '!'}</div>
            <p className="fb-headline">{allGood ? '¡Correcto!' : '¡Casi!'}</p>
            {!allGood && (
              <p className="fb-subline">
                {good} van de {total} goed
              </p>
            )}
            <div className="xp-pill">
              <i />+{earnedXp} XP
            </div>
          </div>

          {shown.map(({ q, i }) => (
            <div key={i}>
              <div className="answer-card">
                <p className="lbl">JUISTE ANTWOORD</p>
                {questions.length > 1 && <p className="answer-q">{q.promptNl}</p>}
                <div className="answer-chip ok">
                  {q.choices[q.answerIndex]}
                  <span style={{ fontSize: 16 }}>✓</span>
                </div>
                <p className="answer-note">{q.explanationNl}</p>
              </div>
              <EvidenceCard
                evidence={q.evidence}
                onPlay={() => playSegment(q.evidence.startSec, q.evidence.endSec, rate)}
              />
            </div>
          ))}

          <p className="intro-h" style={{ color: '#fff', marginTop: 22 }}>
            Transcript
          </p>
          <TranscriptBubbles
            sentences={seg.sentences}
            glossary={episode.glossary}
            episodeId={episodeId}
            dimmed={false}
          />

          <div className="grow" style={{ minHeight: 16 }} />

          <div className="btn-row pad-b">
            <button type="button" className="btn btn-ghost" onClick={listenAgain}>
              Luister opnieuw
            </button>
            <button type="button" className="btn btn-primary" onClick={advance}>
              Doorgaan ▸
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Luisteren + (optioneel) echo/vraagsheet (scherm 5) ----
  const prevSentences = []
  for (let i = 0; i < idx; i++) for (const s of segments[i].sentences) prevSentences.push(s)

  return (
    <div className="session" key={'listen-' + idx}>
      <div className="s-header">
        <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Terug">
          ‹
        </button>
        <span className="s-title" style={ellipsis}>
          {headerTitle}
        </span>
        <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Sluiten">
          ✕
        </button>
      </div>

      <SegmentPlayer
        segment={currentPart}
        isPlaying={isPlaying}
        position={position}
        onToggle={onToggle}
        onReplay={onReplay}
        rate={rate}
        onCycleRate={cycleRate}
      />

      {error && (
        <p style={{ color: '#fff', textAlign: 'center', fontWeight: 700, fontSize: 12, padding: '0 22px' }}>
          {error}
        </p>
      )}

      <div className="transcript">
        {prevSentences.length > 0 && (
          <TranscriptBubbles sentences={prevSentences} glossary={episode.glossary} episodeId={episodeId} dimmed />
        )}
        {reading ? (
          <TranscriptBubbles
            sentences={seg.sentences}
            glossary={episode.glossary}
            episodeId={episodeId}
            highlightSec={isPlaying || position > seg.startSec ? position : null}
          />
        ) : (
          prevSentences.length === 0 && (
            <p className="transcript-empty">
              Tik op play en luister goed.
              <br />
              De oefening verschijnt zodra het fragment klaar is.
            </p>
          )
        )}

        {phase === 'question' && (
          <div className="sheet">
            <div className="sheet-label">
              <span className="pause">⏸</span>
              <span>
                AUTO-PAUZE · VRAAG{questions.length > 1 ? ` ${qIdx + 1}/${questions.length}` : ''}
              </span>
            </div>
            <QuestionCard
              key={seg.id + ':q' + qIdx}
              question={questions[qIdx]}
              selected={selected}
              onSelect={setSelected}
              revealed={revealed}
            />
            {!revealed && (
              <button type="button" className="sheet-replay" onClick={onReplay}>
                ‹‹ Nog eens luisteren
              </button>
            )}
            {revealed ? (
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                onClick={nextQuestion}
              >
                Doorgaan ▸
              </button>
            ) : (
              <button
                type="button"
                className={'btn btn-primary' + (selected === null ? ' is-locked' : '')}
                style={{ marginTop: 12 }}
                onClick={check}
              >
                Controleren
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   C) GATE  ·  quiz-poort over de hele aflevering
   ============================================================ */
function GateFlow({ episode, step, episodeId, navigate }) {
  const setEpisodeScore = useStore((s) => s.setEpisodeScore)
  const completeStep = useStore((s) => s.completeStep)
  const rate = useStore((s) => s.settings.playbackRate)
  const setSetting = useStore((s) => s.setSetting)

  // v2: segmenten kunnen meerdere vragen hebben; pak per fragment één vraag.
  const quizSegments = useMemo(
    () => episode.segments.filter((s) => (s.questions && s.questions.length) || s.question),
    [episode],
  )
  const total = quizSegments.length
  const passPct = step.passPct ?? 80

  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [phase, setPhase] = useState('quiz') // quiz | result
  const [pickSeed, setPickSeed] = useState(0) // bij 'retry' opnieuw kiezen
  const scoreRef = useRef(0)

  // Per quizronde één willekeurige vraag per fragment; herkozen bij een nieuwe poging.
  const picks = useMemo(
    () =>
      quizSegments.map((s) => {
        const qs = s.questions || (s.question ? [s.question] : [])
        return qs[Math.floor(Math.random() * qs.length)]
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quizSegments, pickSeed],
  )

  const player = useSegmentPlayer(episode.audioUrl)
  const { playSegment, pause, resume, setRate, isPlaying, position, error } = player

  const seg = quizSegments[idx]
  const q = picks[idx]

  function onToggle() {
    if (!seg) return
    if (isPlaying) {
      pause()
    } else {
      if (position > seg.startSec + 0.1 && position < seg.endSec - 0.05) resume(rate)
      else playSegment(seg.startSec, seg.endSec, rate)
    }
  }
  function onReplay() {
    if (!seg) return
    playSegment(seg.startSec, seg.endSec, rate)
  }
  function cycleRate() {
    const i = RATES.indexOf(rate)
    const nextRate = RATES[(i + 1) % RATES.length] ?? 1
    setSetting('playbackRate', nextRate)
    setRate(nextRate)
  }

  function check() {
    if (selected === null || revealed) return
    const ok = selected === q.answerIndex
    if (ok) playCorrect()
    else playWrong()
    if (ok) setCorrectCount((c) => c + 1)
    setRevealed(true)
  }

  function next() {
    playClick()
    pause()
    if (idx >= total - 1) {
      const score = Math.round((correctCount / total) * 100)
      scoreRef.current = score
      setEpisodeScore(episodeId, score)
      completeStep(episodeId, step.id)
      setPhase('result')
    } else {
      setIdx((i) => i + 1)
      setSelected(null)
      setRevealed(false)
    }
  }

  function retry() {
    pause()
    setIdx(0)
    setSelected(null)
    setRevealed(false)
    setCorrectCount(0)
    setPickSeed((s) => s + 1)
    setPhase('quiz')
  }

  // ---- Resultaat ----
  if (phase === 'result') {
    const score = scoreRef.current
    const passed = score >= passPct
    return (
      <div className="session" key="result">
        <div className="s-header">
          <span className="s-iconbtn" style={{ visibility: 'hidden' }} />
          <span className="s-title">Quiz · poort</span>
          <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <div className="s-body center">
          <p className="result-emoji">{passed ? '🎁' : '💪'}</p>
          <p className="result-title">{passed ? 'Unidad voltooid! 🎁' : 'Nog even oefenen'}</p>
          <p className="result-score">{score}%</p>
          <p className="result-sub">
            {passed
              ? `Sterk gedaan: je haalde ${score}%.`
              : `Je had ${score}%, je hebt ${passPct}% nodig. Luister de fragmenten nog eens en probeer het opnieuw.`}
          </p>
          <div className="result-actions">
            {!passed && (
              <button type="button" className="btn btn-primary" onClick={retry}>
                Opnieuw
              </button>
            )}
            <button
              type="button"
              className={passed ? 'btn btn-good' : 'btn btn-ghost'}
              onClick={() => navigate('/path')}
            >
              Naar het leerpad ▸
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Quizvraag ----
  const fill = (((idx + 1) / total) * 100).toFixed(1)
  return (
    <div className="session" key={'quiz-' + idx}>
      <div className="s-header">
        <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Sluiten">
          ✕
        </button>
        <div className="s-progress">
          <i style={{ width: fill + '%' }} />
        </div>
        <span className="s-count">
          {idx + 1}/{total}
        </span>
      </div>

      <div className="s-body">
        <SegmentPlayer
          segment={seg}
          isPlaying={isPlaying}
          position={position}
          onToggle={onToggle}
          onReplay={onReplay}
          rate={rate}
          onCycleRate={cycleRate}
          compact
        />
        {error && (
          <p style={{ color: '#fff', textAlign: 'center', fontWeight: 700, fontSize: 12 }}>{error}</p>
        )}

        <QuestionCard
          key={idx + ':' + pickSeed}
          question={q}
          selected={selected}
          onSelect={setSelected}
          revealed={revealed}
          onBrand
        />

        {revealed && (
          <>
            <div className={'fb-bar ' + (selected === q.answerIndex ? 'ok' : 'bad')}>
              <p className="head">
                {selected === q.answerIndex ? '¡Correcto!' : 'Helaas, niet goed'}
              </p>
              <p className="sub">{q.explanationNl}</p>
            </div>
            <EvidenceCard
              evidence={q.evidence}
              onPlay={() => playSegment(q.evidence.startSec, q.evidence.endSec, rate)}
            />
          </>
        )}

        <div className="grow" style={{ minHeight: 16 }} />

        {revealed ? (
          <button type="button" className="btn btn-primary pad-b" onClick={next}>
            {idx >= total - 1 ? 'Bekijk resultaat ▸' : 'Doorgaan'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary pad-b"
            onClick={check}
            disabled={selected === null}
          >
            Controleren
          </button>
        )}
      </div>
    </div>
  )
}

const ellipsis = {
  maxWidth: 220,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
