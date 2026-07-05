import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore, XP_PER_CORRECT, XP_PER_TRY } from '../lib/store'
import { loadLadder, loadEpisode, normalizeWord } from '../lib/contentLoader'
import { dueItems } from '../lib/srs'
import { useSegmentPlayer } from '../lib/audio'
import { playClick, playCorrect, playWrong } from '../lib/sounds'
import QuestionCard from '../components/QuestionCard.jsx'
import TranscriptBubbles from '../components/TranscriptBubbles.jsx'
import VocabExercise from '../components/VocabExercise.jsx'
import SegmentPlayer from '../components/SegmentPlayer.jsx'
import '../session.css'

const RATES = [0.75, 1, 1.25]

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
  const common = { episode, unit, step, episodeId, navigate }

  if (step.type === 'words') return <WordsFlow key={stepId} {...common} />
  if (step.type === 'listen') return <ListenFlow key={stepId} {...common} />
  if (step.type === 'read') return <ListenFlow key={stepId} {...common} reading />
  if (step.type === 'gate') return <GateFlow key={stepId} {...common} />

  return null
}

/* ============================================================
   A) WORDS  ·  intro (scherm 3) -> woordoefening (scherm 4)
   ============================================================ */
function WordsFlow({ episode, step, episodeId, navigate }) {
  const completeStep = useStore((s) => s.completeStep)
  const streak = useStore((s) => s.streak)

  const [phase, setPhase] = useState('intro')
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState('mc') // 'mc' | 'type'
  const [itemChecked, setItemChecked] = useState(false)

  // Oefenitems eenmalig samenstellen: core-vocab + max 6 due SRS-items (geen duplicaten).
  // Elk item krijgt waar mogelijk een audioclip (woord uitgesproken in de podcast).
  const [items] = useState(() => {
    const core = episode.vocab
      .filter((v) => v.core)
      .map((v) => ({ ...v, audioUrl: v.clip ? episode.audioUrl : null }))
    const keys = new Set(core.map((v) => normalizeWord(v.es)))
    const extra = []
    for (const it of dueItems(useStore.getState().srs)) {
      const k = normalizeWord(it.es)
      if (keys.has(k)) continue
      keys.add(k)
      extra.push({ id: 'srs-' + k, es: it.es, nl: it.nl, clip: it.clip, audioUrl: it.audioUrl })
      if (extra.length >= 6) break
    }
    return [...core, ...extra]
  })

  // Woordclips afspelen: één <audio>-element per bron-mp3, gestopt via een timer
  // die pas wordt gezet als het afspelen echt loopt (seek/buffer-vertraging).
  const clipAudiosRef = useRef(new Map())
  const clipTimerRef = useRef(null)
  useEffect(() => {
    const audios = clipAudiosRef.current
    return () => {
      clearTimeout(clipTimerRef.current)
      for (const a of audios.values()) {
        a.pause()
        a.removeAttribute('src')
        a.load()
      }
      audios.clear()
    }
  }, [])

  async function playWordClip(clip, url) {
    if (!clip || !url) return
    let a = clipAudiosRef.current.get(url)
    if (!a) {
      a = new Audio(url)
      a.preload = 'auto'
      clipAudiosRef.current.set(url, a)
    }
    clearTimeout(clipTimerRef.current)
    try {
      a.currentTime = clip.startSec
      await a.play()
      const remaining = Math.max(0.15, clip.endSec - a.currentTime)
      clipTimerRef.current = setTimeout(() => a.pause(), remaining * 1000)
    } catch {
      /* geen audio is geen ramp */
    }
  }

  const pool = useMemo(() => items.map((i) => i.nl), [items])
  const glossaryValues = useMemo(() => Object.values(episode.glossary || {}), [episode])

  const total = items.length

  function next() {
    if (index >= total - 1) {
      completeStep(episodeId, step.id)
      navigate('/path')
      return
    }
    setIndex((i) => i + 1)
    setItemChecked(false)
  }

  // ---- Intro (scherm 3) ----
  if (phase === 'intro') {
    const chips = episode.vocab.slice(0, 6)
    const extra = episode.vocab.length - chips.length
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

        <div className="intro-art" />
        <p className="intro-kicker">PODCAST · {episode.level}</p>
        <p className="intro-title">{episode.title}</p>
        <p className="intro-meta">{meta}</p>

        <div className="intro-sheet">
          <p className="intro-desc">{episode.descriptionNl}</p>
          <p className="intro-h">Woorden in deze aflevering</p>
          <div className="chips">
            {chips.map((v) => (
              <span key={v.id} className="chip">
                {v.es}
              </span>
            ))}
            {extra > 0 && <span className="chip more">+{extra}</span>}
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
              setPhase('exercise')
            }}
          >
            Leer de woorden
          </button>
        </div>
      </div>
    )
  }

  // ---- Oefening (scherm 4) ----
  const item = items[index]
  const fill = (((index + 1) / total) * 100).toFixed(1)
  return (
    <div className="session" key={'ex-' + index}>
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

        <VocabExercise
          key={item.id}
          item={item}
          mode={mode}
          pool={pool}
          glossaryValues={glossaryValues}
          episodeId={episodeId}
          onPlayClip={item.clip && item.audioUrl ? () => playWordClip(item.clip, item.audioUrl) : null}
          onChecked={() => setItemChecked(true)}
          onContinue={next}
          isLast={index === total - 1}
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

  const [phase, setPhase] = useState('listen') // listen | question | feedback | done
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false) // in de vraagsheet: na Controleer kleuren tonen
  const [correct, setCorrect] = useState(false)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [results, setResults] = useState({}) // segId -> correct

  const player = useSegmentPlayer(episode.audioUrl)
  const { playSegment, pause, resume, setRate, isPlaying, position, ended, error } = player

  const seg = segments[idx]

  // Nieuw fragment -> alles resetten (nooit automatisch afspelen: iOS vereist een tap).
  useEffect(() => {
    setPhase('listen')
    setSelected(null)
    setRevealed(false)
    setCorrect(false)
    setHasPlayed(false)
  }, [idx])

  // Auto-pauze: als het fragment is uitgespeeld verschijnt de vragensheet.
  useEffect(() => {
    if (phase === 'listen' && hasPlayed && ended) {
      setPhase('question')
    }
  }, [phase, hasPlayed, ended])

  function onToggle() {
    if (!seg) return
    if (isPlaying) {
      pause()
    } else {
      setHasPlayed(true)
      if (position > seg.startSec + 0.1 && position < seg.endSec - 0.05) resume(rate)
      else playSegment(seg.startSec, seg.endSec, rate)
    }
  }

  function onReplay() {
    if (!seg) return
    setHasPlayed(true)
    playSegment(seg.startSec, seg.endSec, rate)
  }

  function cycleRate() {
    const i = RATES.indexOf(rate)
    const nextRate = RATES[(i + 1) % RATES.length] ?? 1
    setSetting('playbackRate', nextRate)
    setRate(nextRate)
  }

  // Controleer: onthul de kleuren in de sheet en registreer het antwoord meteen.
  function check() {
    if (selected === null || revealed) return
    const ok = selected === seg.question.answerIndex
    if (ok) playCorrect()
    else playWrong()
    answerSegment(episodeId, seg.id, ok)
    setResults((r) => ({ ...r, [seg.id]: ok }))
    setCorrect(ok)
    setRevealed(true)
  }

  function advance() {
    playClick()
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

  function listenAgain() {
    pause()
    setSelected(null)
    setRevealed(false)
    setHasPlayed(false)
    setPhase('listen')
  }

  const headerTitle = `${episode.title} · ${idx + 1}/${segments.length}`

  // ---- Afronding ----
  if (phase === 'done') {
    const outcomes = Object.values(results)
    const good = outcomes.filter(Boolean).length
    const wrong = outcomes.length - good
    const earnedXp = good * XP_PER_CORRECT + wrong * XP_PER_TRY
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
            Je had {good} van {segments.length} vragen goed in dit deel.
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

  // ---- Feedback (scherm 6) ----
  if (phase === 'feedback') {
    const q = seg.question
    const chosen = q.choices[selected]
    const right = q.choices[q.answerIndex]
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
            <div className={'fb-badge ' + (correct ? 'ok' : 'casi')}>{correct ? '✓' : '!'}</div>
            <p className="fb-headline">{correct ? '¡Correcto!' : '¡Casi!'}</p>
            <div className="xp-pill">
              <i />+{correct ? XP_PER_CORRECT : XP_PER_TRY} XP
            </div>
          </div>

          <div className="answer-card">
            <p className="lbl">JUISTE ANTWOORD</p>
            {!correct && (
              <div className="answer-chip chosen-wrong">
                {chosen}
                <span style={{ fontSize: 16 }}>✕</span>
              </div>
            )}
            <div className="answer-chip ok">
              {right}
              <span style={{ fontSize: 16 }}>✓</span>
            </div>
            <p className="answer-note">{q.explanationNl}</p>
          </div>

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

          {correct ? (
            <button type="button" className="btn btn-primary pad-b" onClick={advance}>
              Doorgaan ▸
            </button>
          ) : (
            <div className="btn-row pad-b">
              <button type="button" className="btn btn-ghost" onClick={listenAgain}>
                Luister opnieuw
              </button>
              <button type="button" className="btn btn-primary" onClick={advance}>
                Doorgaan
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---- Luisteren + (optioneel) vraagsheet (scherm 5) ----
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
        segment={seg}
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
              De vraag verschijnt zodra het fragment klaar is.
            </p>
          )
        )}

        {phase === 'question' && (
          <div className="sheet">
            <div className="sheet-label">
              <span className="pause">⏸</span>
              <span>AUTO-PAUZE · VRAAG</span>
            </div>
            <QuestionCard
              question={seg.question}
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
                onClick={() => setPhase('feedback')}
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
                Controleer
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

  const questions = useMemo(() => episode.segments.filter((s) => s.question), [episode])
  const total = questions.length
  const passPct = step.passPct ?? 80

  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [phase, setPhase] = useState('quiz') // quiz | result
  const scoreRef = useRef(0)

  const player = useSegmentPlayer(episode.audioUrl)
  const { playSegment, pause, resume, setRate, isPlaying, position, error } = player

  const seg = questions[idx]

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
    const ok = selected === seg.question.answerIndex
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
          question={seg.question}
          selected={selected}
          onSelect={setSelected}
          revealed={revealed}
          onBrand
        />

        {revealed && (
          <div className={'fb-bar ' + (selected === seg.question.answerIndex ? 'ok' : 'bad')}>
            <p className="head">
              {selected === seg.question.answerIndex ? '¡Correcto!' : 'Helaas, niet goed'}
            </p>
            <p className="sub">{seg.question.explanationNl}</p>
          </div>
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
            Nagaan
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
