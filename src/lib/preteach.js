/*
 * preteach.js — datagedreven pre-teach (spec §4.1, harde regel 8)
 * ================================================================
 *
 * Per aflevering bepalen we de woordenlijst van het transcript, vergelijken
 * die met de FSRS-state van de gebruiker en kiezen precies de onbekende
 * inhoudswoorden die nodig zijn om op ~96% lexicale dekking te komen. Geen
 * handmatige lijstjes: de selectie volgt uit dekking + geheugenstaat.
 *
 * Alles is puur en deterministisch. De enige tijdsafhankelijkheid is de
 * meegegeven `now`; er wordt nooit zelf Date.now() aangeroepen.
 *
 * ------------------------------------------------------------------
 * KEUZES (bewust, zie de vraag in de taakomschrijving)
 * ------------------------------------------------------------------
 *  - Functiewoorden (lidwoorden, voornaamwoorden, voorzetsels, voegwoorden,
 *    kernvormen van ser/estar/haber/ir, vraagwoorden, muy/más/no/sí ...) tellen
 *    als GEDEKT. Het is grammatica, geen kaartmateriaal: we leren ze niet los.
 *  - Eigennamen worden herkend aan HOOFDLETTERGEBRUIK, niet aan de glossary.
 *    Reden: de glossary van deze content bevat de namen juist wél (met "(naam)"),
 *    dus de glossary-toets zou ze niet uitsluiten. Een token dat in élke
 *    voorkomst met hoofdletter staat én minstens één keer MIDDEN in een zin
 *    (dus niet zinsbegin) → eigennaam → gedekt, niet aangeboden.
 *  - Tokens zonder vertaling (niet in glossary én geen vocab-match) kun je niet
 *    leren; die tellen mee als GEDEKT maar worden nooit geselecteerd.
 *  - De note-id (en dus de kaart-id) van een geselecteerd woord is de
 *    canonieke vorm: bij een vocab-match de genormaliseerde vocab-vorm MÉT
 *    lidwoord (zoals de engine notes opslaat en ListenFlow ernaar reviewt),
 *    anders het kale genormaliseerde token. Zo blijft dekking, "bekend"-toets
 *    en de bestaande vocab<->podcast-koppeling op dezelfde sleutel werken.
 */

import { normalizeWord } from './contentLoader'
import { retrievabilityOf } from './cards'
import { State } from 'ts-fsrs'

/*
 * ~120 Spaanse functiewoorden en ultra-frequente vormen. Genormaliseerd
 * (lowercase, met accenten, zonder leestekens) zodat ze direct tegen een
 * genormaliseerd token te toetsen zijn. Een Set: de inhoud is deterministisch.
 */
export const FUNCTION_WORDS = new Set([
  // lidwoorden + samentrekkingen
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'al', 'del',
  // persoonlijke / object / reflexieve voornaamwoorden
  'yo', 'tú', 'tu', 'usted', 'ustedes', 'él', 'ella', 'ello', 'ellos', 'ellas',
  'nosotros', 'nosotras', 'vosotros', 'vosotras',
  'me', 'te', 'se', 'nos', 'os', 'le', 'les',
  'mi', 'mí', 'ti', 'si', 'sí', 'conmigo', 'contigo', 'consigo',
  // bezittelijke
  'mis', 'tus', 'sus', 'su', 'nuestro', 'nuestra', 'nuestros', 'nuestras',
  'vuestro', 'vuestra', 'vuestros', 'vuestras',
  // aanwijzende
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'esto', 'eso',
  'aquel', 'aquella', 'aquello', 'aquellos', 'aquellas',
  // voorzetsels
  'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'desde', 'en', 'entre',
  'hacia', 'hasta', 'para', 'por', 'según', 'sin', 'so', 'sobre', 'tras',
  'durante', 'mediante',
  // voegwoorden + verbindingswoorden
  'y', 'e', 'o', 'u', 'ni', 'que', 'pero', 'sino', 'porque', 'pues', 'aunque',
  'como', 'cuando', 'mientras', 'entonces',
  // vraagwoorden
  'qué', 'quién', 'quiénes', 'cuál', 'cuáles', 'cómo', 'cuándo', 'dónde',
  'cuánto', 'cuánta', 'cuántos', 'cuántas',
  // ser / estar / haber / ir — kernvormen
  'ser', 'soy', 'eres', 'es', 'somos', 'sois', 'son', 'era', 'eras', 'eran', 'fue', 'fui',
  'estar', 'estoy', 'estás', 'está', 'estamos', 'están', 'estaba',
  'haber', 'he', 'has', 'ha', 'hemos', 'han', 'hay',
  'ir', 'voy', 'vas', 'va', 'vamos', 'van', 'iba',
  // frequente bijwoorden / kwantoren / ontkenning
  'no', 'muy', 'más', 'menos', 'ya', 'aquí', 'allí', 'ahí', 'ahora', 'hoy', 'ayer',
  'también', 'tampoco', 'tan', 'tanto', 'todo', 'todos', 'toda', 'todas', 'cada',
  'otro', 'otra', 'otros', 'otras', 'mucho', 'mucha', 'muchos', 'muchas', 'poco',
  'algo', 'nada',
])

const ARTICLES = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo'])

/* Kale vorm van een vocab-item: genormaliseerd, zonder leidend lidwoord. */
function bareForm(es) {
  const norm = normalizeWord(es)
  const parts = norm.split(/\s+/).filter(Boolean)
  if (parts.length > 1 && ARTICLES.has(parts[0])) return parts.slice(1).join(' ')
  return norm
}

/* Eerste letter van een surface-token met hoofdletter? Leidende leestekens
 * (¿ ¡ " « ...) overslaan. */
function startsCapital(surface) {
  const m = String(surface).match(/[^\p{L}]*(\p{L})/u)
  return m ? m[1] !== m[1].toLowerCase() && m[1] === m[1].toUpperCase() : false
}

/* Surface strippen van omringende leestekens, hoofdlettergebruik behouden. */
function cleanSurface(raw) {
  return String(raw).replace(/^[¿?¡!.,;:"'«»()[\]…–—-]+/, '').replace(/[¿?¡!.,;:"'«»()[\]…–—-]+$/, '')
}

/*
 * tokenizeEpisode — alle woorden uit segments[].sentences[].es, genormaliseerd,
 * met frequentietelling. Per uniek token onthouden we ook: een surface-vorm
 * zoals in de tekst, de eerste zin waarin het voorkomt, en of het zich als
 * eigennaam gedraagt (altijd hoofdletter + minstens één keer midden in een zin).
 *
 * Retour: { tokens: [{ id, freq, surface, sentence, proper }], totalMass }
 */
export function tokenizeEpisode(episode) {
  const stats = new Map()
  let totalMass = 0

  for (const seg of episode.segments || []) {
    for (const sentence of seg.sentences || []) {
      const raw = String(sentence.es || '')
      const words = raw.split(/\s+/).filter(Boolean)
      words.forEach((w, i) => {
        const id = normalizeWord(w)
        if (!id) return
        totalMass++
        const cap = startsCapital(w)
        // Zinsbegin: eerste woord, of het vorige woord eindigt op een zin-
        // afsluiter (. ? ! …). Eén es-veld bevat soms meerdere zinnen, dus
        // een hoofdletter ná zulke leestekens telt NIET als "midden in de zin".
        const sentenceInitial = i === 0 || /[.?!…]+["'»)\]]*$/.test(words[i - 1])
        const midSentence = !sentenceInitial
        let s = stats.get(id)
        if (!s) {
          s = {
            id,
            freq: 0,
            surface: cleanSurface(w),
            sentence: raw,
            sawLower: false,
            sawMidCap: false,
          }
          stats.set(id, s)
        }
        s.freq++
        if (!cap) s.sawLower = true
        if (cap && midSentence) s.sawMidCap = true
      })
    }
  }

  const tokens = [...stats.values()].map((s) => ({
    id: s.id,
    freq: s.freq,
    surface: s.surface,
    sentence: s.sentence,
    // eigennaam: nooit klein geschreven én ooit met hoofdletter midden in een zin
    proper: !s.sawLower && s.sawMidCap,
  }))

  return { tokens, totalMass }
}

/*
 * isKnown — kent de gebruiker dit woord al voldoende om de podcast te verstaan?
 *   note bestaat  én  herkenningskaart reps >= 1  én
 *   (staat in learning/relearning, of retrievability >= 0.7 in review-staat).
 * tokenId is de canonieke note-sleutel (zie kop van dit bestand).
 */
export function isKnown(engine, tokenId, now = new Date()) {
  const note = engine.notes[tokenId]
  if (!note) return false
  const rec = engine.cards[tokenId + ':recognition']
  if (!rec || !rec.fsrs) return false
  if (!(rec.fsrs.reps >= 1)) return false
  const state = rec.fsrs.state
  if (state === State.Learning || state === State.Relearning) return true
  if (state === State.Review) return retrievabilityOf(rec, now) >= 0.7
  return false // New
}

/*
 * selectPreTeach — kies de hoogst-frequente onbekende inhoudswoorden tot de
 * lexicale dekking >= target of `max` bereikt is.
 *
 *   dekking = gedekte token-massa / totale token-massa
 *   gedekt  = functiewoord OF bekend OF eigennaam OF geen-vertaling-beschikbaar
 *
 * Retour: { items, coverageBefore, coverageAfter, neededCount }
 *   - items: geselecteerde woorden (max `max`), zie item-vorm hieronder.
 *   - coverageBefore/After: dekking (0..1) vóór en ná deze les.
 *   - neededCount: hoeveel onbekende woorden nodig zijn om target te halen
 *     (kan groter zijn dan max; kan door de gedekte massa ook 0 zijn).
 */
export function selectPreTeach(engine, episode, { target = 0.96, max = 15, now = new Date() } = {}) {
  const { tokens, totalMass } = tokenizeEpisode(episode)

  // Vocab-index op kale vorm: token "ola" -> vocab-item "la ola".
  const vocabByBare = new Map()
  for (const v of episode.vocab || []) {
    const key = bareForm(v.es)
    if (!vocabByBare.has(key)) vocabByBare.set(key, v)
  }
  const glossary = episode.glossary || {}

  let coveredMass = 0
  const learnable = []

  for (const t of tokens) {
    const vocab = vocabByBare.get(t.id) || null
    // canonieke note-sleutel: mét lidwoord bij vocab-match, anders het kale token.
    const canonicalId = vocab ? normalizeWord(vocab.es) : t.id
    const nl = vocab ? vocab.nl : glossary[t.id] || null
    const hasTranslation = !!nl

    const covered =
      FUNCTION_WORDS.has(t.id) ||
      t.proper ||
      !hasTranslation ||
      isKnown(engine, canonicalId, now)

    if (covered) {
      coveredMass += t.freq
    } else {
      learnable.push({
        id: canonicalId,
        token: t.id,
        freq: t.freq,
        es: vocab ? vocab.es : t.surface,
        nl,
        exampleEs: vocab ? vocab.exampleEs || t.sentence : t.sentence,
        clip: vocab ? vocab.clip || null : null,
        audioUrl: episode.audioUrl || null,
        core: true,
      })
    }
  }

  // Hoogst-frequent eerst; bij gelijke frequentie alfabetisch (deterministisch).
  learnable.sort((a, b) => b.freq - a.freq || a.token.localeCompare(b.token))

  const coverageBefore = totalMass ? coveredMass / totalMass : 1

  // Greedy: voeg woorden toe tot de target gehaald is. neededCount telt ongeacht max.
  let running = coveredMass
  let neededCount = 0
  for (const w of learnable) {
    if (totalMass && running / totalMass >= target) break
    running += w.freq
    neededCount++
  }

  const take = Math.min(neededCount, max)
  const chosen = learnable.slice(0, take)
  const items = chosen.map((w) => ({
    id: w.id,
    es: w.es,
    nl: w.nl,
    exampleEs: w.exampleEs,
    clip: w.clip,
    audioUrl: w.audioUrl,
    core: true,
  }))
  const selectedMass = chosen.reduce((a, w) => a + w.freq, 0)
  const coverageAfter = totalMass ? (coveredMass + selectedMass) / totalMass : 1

  return { items, coverageBefore, coverageAfter, neededCount }
}
