/*
 * Toont één vraag met antwoordopties (verticaal, 2px border).
 * Vraagtypes: 'mc' en 'vocabInContext' -> promptNl + choices;
 * 'gap' -> promptNl + textEs met gestileerd gat + choices.
 *
 * Props:
 *  - question: het vraag-object uit de content
 *  - selected: geselecteerde index (of null)
 *  - onSelect(index): keuze-handler
 *  - revealed: na 'Nagaan' -> juist/fout kleuren tonen
 *  - onBrand: true als de kaart op de brand-achtergrond staat (witte prompttekst)
 */
export default function QuestionCard({ question, selected, onSelect, revealed = false, onBrand = false }) {
  const answerIndex = question.answerIndex

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
        {question.choices.map((choice, i) => (
          <button
            key={i}
            type="button"
            className={cls(i)}
            onClick={() => !revealed && onSelect(i)}
            disabled={revealed}
          >
            <span>{choice}</span>
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
