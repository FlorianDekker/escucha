import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { normalizeWord } from '../lib/contentLoader'
import { playClick, playCorrect, playWrong } from '../lib/sounds'
import { playWord } from '../lib/speak'

/*
 * Eén woordoefening (scherm 4), in meerkeuze- of typvorm.
 *
 * Props:
 *  - item: { id, es, nl, exampleEs? }
 *  - mode: 'mc' | 'type'
 *  - pool: array met nl-betekenissen van andere items (distractors)
 *  - glossaryValues: array met glossary-waarden als fallback-distractors
 *  - episodeId
 *  - onChecked(): laat de ouder weten dat er nagegaan is (mode-toggle uitzetten)
 *  - onContinue(): naar het volgende item
 *  - isLast: laatste item? -> knoptekst
 */
export default function VocabExercise({
  item,
  mode,
  pool,
  glossaryValues,
  episodeId,
  onChecked,
  onContinue,
  isLast,
}) {
  const srsAdd = useStore((s) => s.srsAdd)
  const srsReview = useStore((s) => s.srsReview)

  const [selected, setSelected] = useState(null) // mc-index
  const [typed, setTyped] = useState('')
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)

  // Reset invoer als de oefenvorm wisselt (kan alleen vóór het nagaan).
  useEffect(() => {
    setSelected(null)
    setTyped('')
  }, [mode])

  // Meerkeuze-opties: juiste betekenis + 3 distractors, eenmalig per item geschud.
  const choices = useMemo(() => {
    const correctNl = item.nl
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
  }, [item.id])

  const correctChoiceIndex = choices.indexOf(item.nl)

  function grade() {
    if (checked) return
    let ok
    if (mode === 'mc') {
      ok = selected === correctChoiceIndex
    } else {
      ok = matchesTyped(typed, item.nl)
    }
    // SRS bijwerken: eerst toevoegen indien nieuw, dan de review verwerken.
    const key = normalizeWord(item.es)
    srsAdd(key, item.es, item.nl, episodeId)
    srsReview(key, ok)
    if (ok) playCorrect()
    else playWrong()
    setCorrect(ok)
    setChecked(true)
    onChecked && onChecked()
  }

  const canCheck = mode === 'mc' ? selected !== null : typed.trim().length > 0

  return (
    <>
      <p className="q-prompt">Wat betekent dit woord?</p>

      <div
        className="word-card"
        onClick={() => playWord(item.es)}
        role="button"
        style={{ cursor: 'pointer' }}
      >
        <div className="spk" aria-hidden="true">🔊</div>
        <div>
          <p className="es">{item.es}</p>
          <p style={{ margin: '2px 0 0', color: 'var(--brand-soft)', fontWeight: 700, fontSize: 12 }}>
            tik om te beluisteren
          </p>
        </div>
      </div>

      {mode === 'mc' ? (
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
              <span className="num">{i + 1}</span>
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
          placeholder="Typ de Nederlandse vertaling"
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
        <div className={'fb-bar ' + (correct ? 'ok' : 'bad')}>
          <p className="head">{correct ? '¡Correcto!' : 'Bijna. Het juiste antwoord:'}</p>
          <p className="sub">
            <b>{item.es}</b> = {item.nl}
            {item.exampleEs ? (
              <>
                <br />
                {item.exampleEs}
              </>
            ) : null}
          </p>
        </div>
      )}

      {checked ? (
        <button
          type="button"
          className="btn btn-primary pad-b"
          onClick={() => {
            playClick()
            onContinue()
          }}
        >
          {isLast ? 'Afronden ▸' : 'Doorgaan ▸'}
        </button>
      ) : (
        <button
          type="button"
          className={'btn btn-primary pad-b' + (canCheck ? '' : ' is-locked')}
          onClick={grade}
        >
          Nagaan
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

/* Typvorm goedkeuren: elk deel gescheiden door "/" of "," is een geldig antwoord. */
function matchesTyped(input, expected) {
  const guess = normalizeNl(input)
  if (!guess) return false
  const forms = String(expected)
    .split(/[/,]/)
    .map(normalizeNl)
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
