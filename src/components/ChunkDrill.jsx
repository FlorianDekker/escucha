import { useMemo, useState } from 'react'
import { playClick, playCorrect, playWrong } from '../lib/sounds'
import QuestionCard from './QuestionCard.jsx'

/*
 * Chunk-drill (spec §3 stap 9 / §4.3): één nuttige frase uit het fragment.
 * De chunk-audio speelt binnen de klik (onPlay), de Spaanse frase staat groot,
 * en 4 NL-betekenissen vormen een meerkeuze. Na Controleren onthult QuestionCard
 * het juiste antwoord (de vertaling) met kleuren.
 *
 * FOUT beantwoorde chunks worden kaarten (de ouder handelt dat af in onResult);
 * goede chunks worden GEEN kaart (spec §4.3: alleen gemiste).
 *
 * Props:
 *  - chunk: { es, nl, startSec, endSec }
 *  - pool: lijst NL-betekenissen waaruit distractors worden getrokken
 *  - onPlay(): speelt de chunk-audio (moet vanuit een tap komen, iOS)
 *  - onResult(correct): aangeroepen op Doorgaan met of het goed was
 *  - continueLabel: tekst op de doorgaan-knop
 */
function shuffle(arr) {
  const x = arr.slice()
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

export default function ChunkDrill({ chunk, pool, onPlay, onResult, continueLabel = 'Doorgaan ▸' }) {
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)

  // Meerkeuze: correcte betekenis + 3 distractors uit andere chunks/vocab.
  // Het juiste antwoord staat hier op index 0; QuestionCard schudt de weergave.
  const question = useMemo(() => {
    const distractors = shuffle(pool.filter((d) => d && d !== chunk.nl)).slice(0, 3)
    return { type: 'mc', promptNl: 'Wat betekent deze frase?', choices: [chunk.nl, ...distractors], answerIndex: 0 }
  }, [chunk, pool])

  function check() {
    if (selected === null || revealed) return
    const ok = selected === question.answerIndex
    if (ok) playCorrect()
    else playWrong()
    setRevealed(true)
  }

  function cont() {
    playClick()
    onResult(selected === question.answerIndex)
  }

  return (
    <>
      <div className="word-card" style={{ marginTop: 16 }}>
        <button type="button" className="spk" onClick={onPlay} aria-label="Speel de frase">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            <path d="M16.5 8.5a5 5 0 0 1 0 7" />
          </svg>
        </button>
        <div>
          <p className="es">{chunk.es}</p>
          {revealed && <p className="sub">{chunk.nl}</p>}
        </div>
      </div>

      <QuestionCard
        question={question}
        selected={selected}
        onSelect={setSelected}
        revealed={revealed}
        onBrand
      />

      <div className="grow" style={{ minHeight: 16 }} />

      {revealed ? (
        <button type="button" className="btn btn-primary pad-b" onClick={cont}>
          {continueLabel}
        </button>
      ) : (
        <button
          type="button"
          className={'btn btn-primary pad-b' + (selected === null ? ' is-locked' : '')}
          onClick={check}
        >
          Controleren
        </button>
      )}
    </>
  )
}
