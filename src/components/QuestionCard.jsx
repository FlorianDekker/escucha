import { useMemo } from 'react'
import { playClick } from '../lib/sounds'

/*
 * Toont één vraag met antwoordopties (verticaal, 2px border).
 * Vraagtypes: 'mc' en 'vocabInContext' -> promptNl + choices;
 * 'gap' -> promptNl + textEs met gestileerd gat + choices.
 *
 * De weergavevolgorde van de opties wordt hier geschud; selected/onSelect werken
 * met de ORIGINELE index uit de content, zodat de aanroepende code gewoon tegen
 * question.answerIndex kan checken en het juiste antwoord nooit voorspelbaar
 * op dezelfde plek staat.
 *
 * Props:
 *  - question: het vraag-object uit de content
 *  - selected: geselecteerde originele index (of null)
 *  - onSelect(index): keuze-handler (originele index)
 *  - revealed: na 'Nagaan' -> juist/fout kleuren tonen
 *  - onBrand: true als de kaart op de brand-achtergrond staat (witte prompttekst)
 */
export default function QuestionCard({ question, selected, onSelect, revealed = false, onBrand = false }) {
  const answerIndex = question.answerIndex

  const order = useMemo(() => {
    const idx = question.choices.map((_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    return idx
  }, [question])

  function cls(i) {
    if (revealed) {
      if (i === answerIndex) return 'opt ok'
      if (i === selected) return 'opt bad'
      return 'opt'
    }
    return i === selected ? 'opt sel' : 'opt'
  }

  return (
    <div>
      {question.type === 'gap' ? (
        <>
          <p className={'qc-prompt' + (onBrand ? ' on-brand' : '')}>{question.promptNl}</p>
          <p className={'qc-gap' + (onBrand ? ' on-brand' : '')}>{renderGap(question.textEs)}</p>
        </>
      ) : (
        <p className={'qc-prompt' + (onBrand ? ' on-brand' : '')}>{question.promptNl}</p>
      )}

      <div className="opts">
        {order.map((i) => (
          <button
            key={i}
            type="button"
            className={cls(i)}
            onClick={() => {
              if (revealed) return
              playClick()
              onSelect(i)
            }}
            disabled={revealed}
          >
            <span>{question.choices[i]}</span>
            {revealed && i === answerIndex && <span className="opt-badge ok">✓</span>}
            {revealed && i === selected && i !== answerIndex && (
              <span className="opt-badge bad">✕</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/* Vervang het gat "___" door een gestileerde onderstreping. */
function renderGap(textEs) {
  const parts = String(textEs).split('___')
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && <span className="qc-blank">&nbsp;</span>}
    </span>
  ))
}
