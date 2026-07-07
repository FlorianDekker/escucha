import { useEffect, useMemo, useState } from 'react'
import { spellingHint } from '../lib/cards'
import { playClick, playCorrect, playWrong } from '../lib/sounds'
import { playCardAudio } from '../lib/speak'

/*
 * Eén woordkaart-presentatie. Twee richtingen (siblings, spec §2):
 *
 *  - recognition (ES-audio -> NL): de vraagkant is ALLEEN audio, geen Spaanse
 *    tekst. Antwoord via meerkeuze (4 NL-betekenissen) of typen (NL). Na de
 *    reveal: audio nogmaals + Spaanse spelling + NL + voorbeeldzin + klank/schrift-hint.
 *
 *  - production (NL -> ES): de vraagkant is de Nederlandse tekst; de gebruiker
 *    typt het Spaanse woord (accent-vergevend). Reveal: native audio + spelling.
 *
 * De acquisitie-logica (2x goed, re-queue) zit in de ouder (WordsFlow / Words).
 * Deze component beoordeelt één presentatie en meldt de uitkomst via onGraded.
 *
 * Props:
 *  - direction: 'recognition' | 'production'
 *  - note: { es, nl, exampleEs?, clip?, audioUrl? }
 *  - mode: 'mc' | 'type'  (alleen relevant voor recognition; production = altijd typen)
 *  - pool: NL-betekenissen van andere items (distractors, recognition-mc)
 *  - glossaryValues: extra NL-distractors als fallback
 *  - onGraded(correct): eenmalig bij Controleren
 *  - onContinue(): naar het volgende item
 *  - continueLabel: knoptekst voor Doorgaan
 */
export default function VocabExercise({
  direction = 'recognition',
  note,
  mode = 'mc',
  pool = [],
  glossaryValues = [],
  onGraded,
  onContinue,
  continueLabel = 'Doorgaan ▸',
  modeToggle = null,
}) {
  const isProduction = direction === 'production'
  const effectiveMode = isProduction ? 'type' : mode

  const [selected, setSelected] = useState(null) // mc-index
  const [typed, setTyped] = useState('')
  const [checked, setChecked] = useState(false)

  // De vraagkant-audio van een herkenningskaart wordt door de ouder afgespeeld
  // bij het verschijnen (binnen de klik, zodat de browser het niet blokkeert).
  // Hier hoeft alleen de herbeluster-knop + reveal-audio te werken.

  // Reset invoer als de oefenvorm wisselt (kan alleen vóór het nagaan).
  useEffect(() => {
    setSelected(null)
    setTyped('')
  }, [effectiveMode])

  // Meerkeuze-opties (alleen recognition-mc): juiste NL + 3 distractors.
  const choices = useMemo(() => {
    const correctNl = note.nl
    const seen = new Set([normalizeNl(correctNl)])
    const distractors = []
    for (const cand of shuffle([...pool])) {
      const n = normalizeNl(cand)
      if (!seen.has(n)) {
        seen.add(n)
        distractors.push(cand)
      }
      if (distractors.length >= 3) break
    }
    for (const cand of shuffle([...glossaryValues])) {
      if (distractors.length >= 3) break
      const n = normalizeNl(cand)
      if (!seen.has(n)) {
        seen.add(n)
        distractors.push(cand)
      }
    }
    return shuffle([correctNl, ...distractors])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.es])

  const correctChoiceIndex = choices.indexOf(note.nl)

  function grade() {
    if (checked) return
    let ok
    if (isProduction) {
      ok = matchesTypedEs(typed, note.es)
    } else if (effectiveMode === 'mc') {
      ok = selected === correctChoiceIndex
    } else {
      ok = matchesTyped(typed, note.nl)
    }
    if (ok) playCorrect()
    else playWrong()
    setChecked(true)
    // Reveal: de native uitspraak (nogmaals) als bevestiging/feedback.
    playCardAudio(note)
    if (onGraded) onGraded(ok)
  }

  const canCheck =
    effectiveMode === 'mc' ? selected !== null : typed.trim().length > 0
  const hint = spellingHint(note.es)

  return (
    <>
      {isProduction ? (
        // ---- Productie: NL-tekst als vraag ----
        <>
          <div className="prod-pill">SCHRIJF IN HET SPAANS</div>
          <p className="q-prompt">Hoe schrijf je dit woord?</p>
          <div className="prod-word-card">
            <p className="prod-word">{note.nl}</p>
          </div>
        </>
      ) : (
        // ---- Herkenning: alleen audio als vraag ----
        <>
          <p className="q-prompt">Welk woord hoor je?</p>
          <button
            type="button"
            className="audio-q"
            onClick={() => playCardAudio(note)}
            aria-label="Luister nog eens"
          >
            <span className="audio-q-icon">
              <span className="audio-q-ring" />
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative' }}>
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path d="M16.5 8.5a5 5 0 0 1 0 7" />
                <path d="M19 6a8 8 0 0 1 0 12" />
              </svg>
            </span>
            <span className="audio-q-label">Tik en luister · nog eens 🔁</span>
          </button>
          {modeToggle}
        </>
      )}

      {effectiveMode === 'mc' && !isProduction ? (
        <div className="vgrid">
          {choices.map((choice, i) => (
            <button
              key={i}
              type="button"
              className={'vopt' + vClass(i, selected, checked, correctChoiceIndex)}
              onClick={() => {
                if (checked) return
                playClick()
                setSelected(i)
              }}
              disabled={checked}
            >
              {checked && i === correctChoiceIndex && <span className="badge ok">✓</span>}
              {checked && i === selected && i !== correctChoiceIndex && (
                <span className="badge bad">✕</span>
              )}
              {choice}
            </button>
          ))}
        </div>
      ) : (
        <input
          className="type-field"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={isProduction ? 'Typ het Spaanse woord' : 'Typ de Nederlandse vertaling'}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={checked}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canCheck && !checked) grade()
          }}
        />
      )}

      <div className="grow" />

      {checked && (
        <div className="reveal">
          <div className="reveal-head">
            <button type="button" className="reveal-spk" onClick={() => playCardAudio(note)} aria-label="Beluister">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path d="M16.5 8.5a5 5 0 0 1 0 7" />
              </svg>
            </button>
            <div>
              <p className="reveal-es">{note.es}</p>
              <p className="reveal-nl">{note.nl}</p>
            </div>
          </div>
          {note.exampleEs && <p className="reveal-example">“{note.exampleEs}”</p>}
          {note.exampleNl && <p className="reveal-example-nl">{note.exampleNl}</p>}
          {hint && (
            <div className="reveal-hint">
              <span className="reveal-hint-ico">💡</span>
              <p>{hint}</p>
            </div>
          )}
        </div>
      )}

      {checked ? (
        <button
          type="button"
          className="btn btn-primary pad-b"
          onClick={() => {
            playClick()
            if (onContinue) onContinue()
          }}
        >
          {continueLabel}
        </button>
      ) : (
        <button
          type="button"
          className={'btn btn-primary pad-b' + (canCheck ? '' : ' is-locked')}
          onClick={grade}
        >
          Controleren
        </button>
      )}
    </>
  )
}

function vClass(i, selected, checked, correctIndex) {
  if (checked) {
    if (i === correctIndex) return ' ok'
    if (i === selected) return ' bad'
    return ''
  }
  return i === selected ? ' sel' : ''
}

/* Normaliseer een NL-antwoord: lowercase, accenten weg, leestekens weg,
   lidwoorden (de/het/een) negeren, spaties normaliseren. */
function normalizeNl(s) {
  const words = String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,;:!?"'()]/g, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !['de', 'het', 'een'].includes(w))
  return words.join(' ')
}

/* Typvorm (NL) goedkeuren: elk deel gescheiden door "/" of "," is geldig. */
function matchesTyped(input, expected) {
  const guess = normalizeNl(input)
  if (!guess) return false
  const forms = String(expected)
    .split(/[/,]/)
    .map(normalizeNl)
    .filter(Boolean)
  return forms.includes(guess)
}

/* Normaliseer een Spaans antwoord: lowercase, accenten/leestekens weg,
   lidwoorden (el/la/los/las/un/una) negeren. Zo geldt "playa" ook voor
   "la playa" en telt een vergeten accent niet als fout. */
function normalizeEs(s) {
  const words = String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"'«»()]/g, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !['el', 'la', 'los', 'las', 'un', 'una'].includes(w))
  return words.join(' ')
}

function matchesTypedEs(input, expected) {
  const guess = normalizeEs(input)
  if (!guess) return false
  const forms = String(expected)
    .split(/[/,]/)
    .map(normalizeEs)
    .filter(Boolean)
  return forms.includes(guess)
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
