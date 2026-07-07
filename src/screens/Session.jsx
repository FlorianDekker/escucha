import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore, XP_PER_CORRECT, XP_PER_TRY } from '../lib/store'
import { loadLadder, loadEpisode, normalizeWord } from '../lib/contentLoader'
import { selectPreTeach } from '../lib/preteach'
import { useSegmentPlayer } from '../lib/audio'
import { playClick, playCorrect, playWrong } from '../lib/sounds'
import { playWord, playCardAudio } from '../lib/speak'
import QuestionCard from '../components/QuestionCard.jsx'
import TranscriptBubbles from '../components/TranscriptBubbles.jsx'
import VocabExercise from '../components/VocabExercise.jsx'
import SegmentPlayer from '../components/SegmentPlayer.jsx'
import ChunkDrill from '../components/ChunkDrill.jsx'
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
  if (step.type === 'extensive') return <ExtensiveFlow key={stepId} {...common} />
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

  // Datagedreven pre-teach (spec §4.1, harde regel 8): kies op basis van
  // lexicale dekking + FSRS-state welke onbekende woorden deze les nodig heeft.
  // Berekend op de huidige engine (vóór introductie), zodat de dekking klopt.
  const preteach = useMemo(() => selectPreTeach(engine, episode), [engine, episode])

  // Vraagkant-audio afspelen binnen een klik (herkenning). Productie toont NL-tekst.
  // eng meegeven omdat de store net bijgewerkt kan zijn (nieuwe notes/kaarten).
  function speakQuestion(c, eng = engine) {
    if (!c) return
    if (c.direction === 'recognition') playCardAudio(eng.notes[c.noteId])
  }

  // ---- Sessie opbouwen (binnen de "Leer de woorden"-klik) ----
  function startExercise() {
    const store = useStore.getState()
    // Productiekaarten aanmaken die aan hun fasering toe zijn (engine-onderhoud).
    store.engineMaybeIntroduceProduction()
    // De pre-teach-selectie introduceren (maakt de herkenningskaarten aan). De
    // note-id is de canonieke sleutel uit selectPreTeach, zodat dekking, de
    // "bekend"-toets en de acquisitiewachtrij op dezelfde sleutel werken.
    // Due-kaarten worden hier NIET meer gemengd: die horen bij de Woorden-tab.
    const items = preteach.items
    for (const it of items) {
      store.engineIntroduceNote({
        id: it.id,
        es: it.es,
        nl: it.nl,
        exampleEs: it.exampleEs,
        clip: it.clip,
        audioUrl: it.audioUrl,
        sourceEpisodeId: episodeId,
      })
    }
    const eng = useStore.getState().engine
    const q = items.map((it) => ({ cardId: it.id + ':recognition', phase: 'acquire' }))
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
    const count = preteach.items.length
    const allKnown = count === 0
    const covBefore = Math.round(preteach.coverageBefore * 100)
    const covAfter = Math.round(preteach.coverageAfter * 100)
    const meta = `${episode.segments.length} fragmenten · ${minutes} min · ${count} ${count === 1 ? 'woord' : 'woorden'}`
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

          {allKnown ? (
            <p className="intro-desc" style={{ marginTop: 10, fontWeight: 700 }}>
              Je kent alle woorden voor deze aflevering al.
            </p>
          ) : (
            <>
              {/* Woorddekking vóór en ná de pre-teach (spec §4.1). */}
              <p className="intro-desc" style={{ marginTop: 10, fontWeight: 700 }}>
                Woorddekking: {covBefore}% → {covAfter}% na deze les
              </p>
              <p className="intro-h">Woorden in deze aflevering</p>
              <div className="word-list">
                {preteach.items.map((it) => (
                  <button key={it.id} type="button" className="word-row" onClick={() => playWord(it.es)}>
                    <span className="word-es">
                      <i>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 9v6h4l5 4V5L8 9H4z" />
                          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
                        </svg>
                      </i>
                      {it.es}
                    </span>
                    <span className="word-nl">{it.nl}</span>
                  </button>
                ))}
              </div>
            </>
          )}

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
              if (allKnown) {
                completeStep(episodeId, step.id)
                navigate('/path')
              } else {
                startExercise()
              }
            }}
          >
            {allKnown ? 'Doorgaan ▸' : 'Leer de woorden'}
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
function ListenFlow({ episode, episodeId, step, navigate, reading = false }) {
  const answerSegment = useStore((s) => s.answerSegment)
  const completeStep = useStore((s) => s.completeStep)
  const setSegmentIndex = useStore((s) => s.setSegmentIndex)
  const engineReviewFromListening = useStore((s) => s.engineReviewFromListening)
  const engineIntroduceNote = useStore((s) => s.engineIntroduceNote)
  const rate = useStore((s) => s.settings.playbackRate)
  const setSetting = useStore((s) => s.setSetting)

  const segments = useMemo(
    () => step.segmentIds.map((id) => episode.segments.find((s) => s.id === id)).filter(Boolean),
    [episode, step],
  )

  // Hervatten: start op de voor déze stap opgeslagen index.
  const initialIdx = useMemo(() => {
    const si = useStore.getState().episodes[episodeId]?.segmentIndexByStep?.[step.id]
    return typeof si === 'number' && si >= 0 && si < segments.length ? si : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [idx, setIdx] = useState(initialIdx)

  // Fase-machine per fragment: focus -> listen -> question(q1..qn) -> feedback.
  // Na de feedback van het láátste fragment volgt (indien er chunks zijn) de
  // chunk-drill, daarna done. De 'focus'-fase (spec §3 stap 2) toont de
  // luisterfocus vóór het afspelen; bij v2-content zonder focusNl starten we
  // meteen op 'listen' (dan verschijnt de bestaande hint).
  // (seg.echo blijft inerte content voor het latere zinsdictee, zie docs/leerengine-spec.md §6.)
  const [phase, setPhase] = useState(() =>
    segments[initialIdx]?.focusNl ? 'focus' : 'listen',
  ) // focus | listen | question | feedback | chunks | done
  const [qIdx, setQIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false) // in de vraagsheet: na Controleer kleuren tonen
  const [correct, setCorrect] = useState(false)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [qOutcomes, setQOutcomes] = useState([]) // per vraag: true/false
  const [results, setResults] = useState({}) // segId -> { good, total }

  // Chunk-drill aan het einde van de stap.
  const [chunkIdx, setChunkIdx] = useState(0)
  const [chunksAdded, setChunksAdded] = useState(0)
  const chunkAddedRef = useRef(new Set())
  // Podcast-als-review / fout-wordt-kaart: max. één keer per vraag verwerken.
  const reviewProcessedRef = useRef(new Set())

  const player = useSegmentPlayer(episode.audioUrl)
  const { playSegment, pause, resume, setRate, isPlaying, position, ended, error } = player

  const seg = segments[idx]

  // Alle chunks van de fragmenten in deze stap (max ~5, ontdubbeld op de frase).
  // Zonder chunks in de content blijft dit leeg en wordt de drill overgeslagen.
  const stepChunks = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const s of segments) {
      if (!Array.isArray(s.chunks)) continue
      for (const c of s.chunks) {
        const key = normalizeWord(c.es)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(c)
        if (out.length >= 5) return out
      }
    }
    return out
  }, [segments])

  // Distractor-pool voor de chunk-drill: NL-betekenissen van andere chunks + vocab.
  const chunkNlPool = useMemo(() => {
    const set = new Set()
    for (const c of stepChunks) if (c.nl) set.add(c.nl)
    for (const v of episode.vocab || []) if (v.nl) set.add(v.nl)
    return [...set]
  }, [stepChunks, episode])

  // v2 backward compatible: één of meerdere vragen.
  const questions = seg.questions || (seg.question ? [seg.question] : [])
  const segTotal = questions.length

  const currentPart = { startSec: seg.startSec, endSec: seg.endSec }

  // Nieuw fragment -> alles resetten (nooit automatisch afspelen: iOS vereist een tap).
  // Heeft het fragment een luisterfocus, dan start het op de focus-fase.
  useEffect(() => {
    setPhase(segments[idx]?.focusNl ? 'focus' : 'listen')
    setQIdx(0)
    setSelected(null)
    setRevealed(false)
    setCorrect(false)
    setHasPlayed(false)
    setQOutcomes([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (phase === 'focus') setPhase('listen') // luisterfocus gelezen, nu luisteren
      if (position > currentPart.startSec + 0.1 && position < currentPart.endSec - 0.05)
        resume(rate)
      else playSegment(currentPart.startSec, currentPart.endSec, rate)
    }
  }

  function onReplay() {
    if (!seg) return
    setHasPlayed(true)
    if (phase === 'focus') setPhase('listen')
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

    // Koppeling vocab <-> podcast (spec §4.2/§4.3), conservatief en één keer per
    // vraag. Alleen expliciete woord- of audio-cloze-vragen met een vocabId:
    //  - goed  -> tel als FSRS-review (Good) op de herkenningskaart (als die bestaat).
    //  - fout (audio-cloze) -> introduceer de note als die nog niet bestaat.
    const qKey = seg.id + ':q' + qIdx
    if (
      !reviewProcessedRef.current.has(qKey) &&
      q.vocabId &&
      (q.type === 'vocabInContext' || q.type === 'gap')
    ) {
      reviewProcessedRef.current.add(qKey)
      const v = (episode.vocab || []).find((x) => x.id === q.vocabId)
      if (v) {
        if (ok) {
          engineReviewFromListening(v.es)
        } else if (q.type === 'gap') {
          engineIntroduceNote({
            kind: 'word',
            es: v.es,
            nl: v.nl,
            exampleEs: v.exampleEs,
            clip: v.clip,
            audioUrl: episode.audioUrl,
            sourceEpisodeId: episodeId,
          })
        }
      }
    }

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

  function finishStep() {
    completeStep(episodeId, step.id)
    setSegmentIndex(episodeId, step.id, 0)
    setPhase('done')
  }

  function advance() {
    playClick()
    pause()
    if (idx >= segments.length - 1) {
      // Na het laatste fragment van een luisterstap: de chunk-drill (spec §3
      // stap 9), mits er chunks zijn. De leesstap slaat de drill over.
      if (!reading && stepChunks.length > 0) {
        setChunkIdx(0)
        setPhase('chunks')
      } else {
        finishStep()
      }
    } else {
      const n = idx + 1
      setSegmentIndex(episodeId, step.id, n)
      setIdx(n)
    }
  }

  // Eén chunk afgerond: fout beantwoorde chunks worden kaarten (spec §4.3),
  // goede niet. Daarna door naar de volgende chunk of afronden.
  function onChunkResult(wasCorrect) {
    const chunk = stepChunks[chunkIdx]
    if (chunk && !wasCorrect && !chunkAddedRef.current.has(chunk.es)) {
      chunkAddedRef.current.add(chunk.es)
      engineIntroduceNote({
        kind: 'chunk',
        es: chunk.es,
        nl: chunk.nl,
        clip: { startSec: chunk.startSec, endSec: chunk.endSec },
        audioUrl: episode.audioUrl,
        sourceEpisodeId: episodeId,
      })
      setChunksAdded((n) => n + 1)
    }
    if (chunkIdx >= stepChunks.length - 1) finishStep()
    else setChunkIdx((i) => i + 1)
  }

  // Het hele fragment opnieuw: alle fasen van dit fragment resetten.
  function listenAgain() {
    pause()
    setPhase(seg?.focusNl ? 'focus' : 'listen')
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
          {chunksAdded > 0 && (
            <p className="result-sub" style={{ marginTop: 10 }}>
              {chunksAdded} {chunksAdded === 1 ? 'chunk gaat' : 'chunks gaan'} naar je herhaalstapel,
              die komen binnenkort terug.
            </p>
          )}
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

  // ---- Chunk-drill (spec §3 stap 9): na het laatste fragment, vóór done ----
  if (phase === 'chunks') {
    const chunk = stepChunks[chunkIdx]
    const isLast = chunkIdx >= stepChunks.length - 1
    return (
      <div className="session" key={'chunks-' + chunkIdx}>
        <div className="s-header">
          <span className="s-iconbtn" style={{ visibility: 'hidden' }} />
          <span className="s-title">Handige frases</span>
          <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <div className="s-body">
          <p className="chunk-kicker">
            FRASE {chunkIdx + 1}/{stepChunks.length}
          </p>
          <p className="chunk-lead">Luister naar de frase en kies de betekenis.</p>
          <ChunkDrill
            key={chunkIdx}
            chunk={chunk}
            pool={chunkNlPool}
            onPlay={() => playSegment(chunk.startSec, chunk.endSec, rate)}
            onResult={onChunkResult}
            continueLabel={isLast ? 'Afronden ▸' : 'Doorgaan ▸'}
          />
        </div>
      </div>
    )
  }

  // ---- Luisteren + (optioneel) focus/vraagsheet (scherm 5) ----
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
        {phase === 'focus' ? (
          /* Luisterfocus (spec §3 stap 2 / harde regel 5): setup + focusvraag,
             géén antwoordopties. De gebruiker tikt zelf op play. */
          <div className="focus-panel">
            {seg.contextNl && <p className="focus-context">{seg.contextNl}</p>}
            <p className="focus-label">LUISTERFOCUS</p>
            <p className="focus-q">{seg.focusNl}</p>
            <p className="focus-hint">Tik op play en luister waar het antwoord zit.</p>
          </div>
        ) : (
          <>
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
          </>
        )}

        {phase === 'question' && (
          <div className="sheet">
            <div className="sheet-label">
              <span className="pause">⏸</span>
              <span>{qIdx === 0 ? 'VRAAG · HOOFDLIJN' : 'VRAAG · DETAIL'}</span>
            </div>
            <QuestionCard
              key={seg.id + ':q' + qIdx}
              question={questions[qIdx]}
              selected={selected}
              onSelect={setSelected}
              revealed={revealed}
            />
            {questions[qIdx].type === 'gap' && questions[qIdx].evidence?.startSec != null && (
              /* Audio-cloze (spec §3 stap 6): de zin nog eens horen, dan het gat vullen. */
              <button
                type="button"
                className="cloze-play"
                onClick={() =>
                  playSegment(
                    questions[qIdx].evidence.startSec,
                    questions[qIdx].evidence.endSec,
                    rate,
                  )
                }
              >
                🔊 Speel de zin
              </button>
            )}
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
   C) EXTENSIVE  ·  de hele aflevering vrij uitluisteren (spec §3 stap 10)
   ============================================================ */
/*
 * Afsluitende luisterstap: volume + tempogewenning. Geen vragen, geen
 * verplicht transcript. De speler beslaat de HELE aflevering (0..durationSec).
 * "Afronden" wordt actief zodra >= 60% is beluisterd of het einde is bereikt.
 */
function ExtensiveFlow({ episode, step, episodeId, podcast, navigate }) {
  const completeStep = useStore((s) => s.completeStep)
  const rate = useStore((s) => s.settings.playbackRate)
  const setSetting = useStore((s) => s.setSetting)

  const player = useSegmentPlayer(episode.audioUrl)
  const { playSegment, pause, resume, setRate, isPlaying, position, ended, error } = player

  const whole = { startSec: 0, endSec: episode.durationSec }
  const [maxPos, setMaxPos] = useState(0)

  // Verste beluisterde positie bijhouden (voor de 60%-drempel).
  useEffect(() => {
    setMaxPos((m) => (position > m ? position : m))
  }, [position])

  function onToggle() {
    if (isPlaying) {
      pause()
    } else if (position > 0.1 && position < episode.durationSec - 0.5) {
      resume(rate)
    } else {
      playSegment(0, episode.durationSec, rate)
    }
  }
  function onReplay() {
    playSegment(0, episode.durationSec, rate)
  }
  function cycleRate() {
    const i = RATES.indexOf(rate)
    const nextRate = RATES[(i + 1) % RATES.length] ?? 1
    setSetting('playbackRate', nextRate)
    setRate(nextRate)
  }

  const listenedPct = episode.durationSec ? maxPos / episode.durationSec : 0
  const canFinish = listenedPct >= 0.6 || ended

  function finish() {
    playClick()
    pause()
    completeStep(episodeId, step.id)
    navigate('/path')
  }

  return (
    <div className="session" key="extensive">
      <div className="s-header">
        <button className="s-iconbtn" onClick={() => navigate('/path')} aria-label="Terug">
          ‹
        </button>
        <span className="s-title" style={ellipsis}>
          {step.labelNl || 'Uitluisteren'}
        </span>
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
      <p className="intro-kicker">UITLUISTEREN</p>
      <p className="intro-title">{episode.title}</p>
      <p className="intro-meta">Luister de aflevering nu vrij uit, zonder vragen.</p>

      <SegmentPlayer
        segment={whole}
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

      <div className="grow" />

      <div className="btn-row pad-b" style={{ padding: '0 22px 22px' }}>
        <button
          type="button"
          className={'btn btn-primary' + (canFinish ? '' : ' is-locked')}
          onClick={finish}
        >
          Afronden ▸
        </button>
      </div>
    </div>
  )
}

/* ============================================================
   D) GATE  ·  quiz-poort over de hele aflevering
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
