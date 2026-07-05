import { useState } from 'react'
import { useStore } from '../lib/store'
import { normalizeWord } from '../lib/contentLoader'

/*
 * Transcript als chatbubbels met sprekerlabel.
 *  - dimmed=true: gedimde bubbels van eerdere fragmenten (niet tikbaar).
 *  - dimmed=false: massieve bubbels van het huidige fragment; ELK woord is tikbaar
 *    -> popover met NL-vertaling uit de glossary + knop "+ Mijn woorden".
 *
 * Props: sentences [{speaker, es}], glossary, episodeId, dimmed
 */
export default function TranscriptBubbles({ sentences, glossary = {}, episodeId, dimmed = false }) {
  const srsAdd = useStore((s) => s.srsAdd)
  const srsMap = useStore((s) => s.srs)
  const [active, setActive] = useState(null) // "sentenceIdx-wordIdx"

  // Sprekervolgorde bepaalt links/rechts (eerste spreker links).
  const order = []
  for (const s of sentences) if (!order.includes(s.speaker)) order.push(s.speaker)
  const sideOf = (speaker) => (order.indexOf(speaker) % 2 === 0 ? 'left' : 'right')

  return (
    <div className="bubbles" onClick={() => active && setActive(null)}>
      {sentences.map((sentence, si) => {
        const right = sideOf(sentence.speaker) === 'right'
        return (
          <div
            key={si}
            className={
              'bubble ' + (dimmed ? 'dim' : 'solid') + (right ? ' right' : '')
            }
          >
            {sentence.speaker && <span className="spk-name">{sentence.speaker}</span>}
            {dimmed ? (
              sentence.es
            ) : (
              <Words
                text={sentence.es}
                si={si}
                glossary={glossary}
                active={active}
                setActive={setActive}
                srsAdd={srsAdd}
                srsMap={srsMap}
                episodeId={episodeId}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Words({ text, si, glossary, active, setActive, srsAdd, srsMap, episodeId }) {
  // Splits op witruimte maar behoud de spaties, zodat de zin natuurlijk blijft.
  const tokens = String(text).split(/(\s+)/)
  return (
    <>
      {tokens.map((token, wi) => {
        if (!/[a-zA-ZáéíóúñüÁÉÍÓÚÑÜ¿?¡!]/.test(token)) return <span key={wi}>{token}</span>
        const key = normalizeWord(token)
        const hasTranslation = key in glossary
        const translation = glossary[key] || 'geen vertaling gevonden'
        const id = `${si}-${wi}`
        const isActive = active === id
        const added = !!srsMap[key]
        return (
          <span
            key={wi}
            className={'tw' + (isActive ? ' active' : '')}
            onClick={(e) => {
              e.stopPropagation()
              setActive(isActive ? null : id)
            }}
          >
            {token}
            {isActive && (
              <span className="popover" onClick={(e) => e.stopPropagation()}>
                <span className="tr">{translation}</span>
                {hasTranslation && (
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => srsAdd(key, token.trim(), translation, episodeId)}
                  >
                    {added ? 'Toegevoegd ✓' : '+ Mijn woorden'}
                  </button>
                )}
              </span>
            )}
          </span>
        )
      })}
    </>
  )
}
