/*
 * cards.js — het hart van de leerengine van Vamos!
 * ==================================================
 *
 * Eén enkele spaced-repetition-scheduler voor de HELE app: FSRS-6 via ts-fsrs.
 * Er bestaat geen tweede systeem met hardcoded intervallen (harde regel 1 en 9
 * uit docs/leerengine-spec.md). Alles wat je leert wordt een kaart in deze
 * scheduler: woorden nu, chunks en gemiste zinnen later.
 *
 * ------------------------------------------------------------------
 * DATASTRUCTUUR (leeft in de zustand-store onder `engine`)
 * ------------------------------------------------------------------
 *   engine = { notes, cards, log }
 *
 *   notes[id] = {
 *     id,            // genormaliseerd Spaans (normalizeWord), stabiele sleutel
 *     kind,          // 'word' nu; later 'chunk' | 'sentence' (zelfde machinerie)
 *     es,            // Spaanse vorm zoals getoond
 *     nl,            // Nederlandse betekenis
 *     exampleEs,     // optionele voorbeeldzin
 *     clip,          // optioneel { startSec, endSec } in de aflevering-audio
 *     audioUrl,      // optionele bron voor die clip (episode.audioUrl)
 *     sourceEpisodeId,
 *   }
 *
 *   cards[cardId] = {
 *     id,            // `${noteId}:${direction}`
 *     noteId,
 *     direction,     // 'recognition' (ES-audio -> NL) | 'production' (NL -> ES)
 *     createdAt,     // ISO-string; moment van introductie (voor fasering)
 *     fsrs,          // de volledige ts-fsrs Card-state, serialiseerbaar:
 *                    //   due & last_review als ISO-string, state als getal
 *   }
 *
 *   log = [ { cardId, at, rating, state, due, stability, difficulty,
 *             scheduled_days, learning_steps, review, ... } ]
 *   Append-only reviewlog. Bewaard zodat we later de FSRS-optimizer op écht
 *   gedrag kunnen draaien (spec §1, "optimizer voor later").
 *
 * ------------------------------------------------------------------
 * PUBLIEKE API (allemaal puur: engine erin, nieuwe engine eruit)
 * ------------------------------------------------------------------
 *   freshEngine()                         -> lege engine
 *   introduceNote(engine, note, now?)     -> voegt note + herkenningskaart toe
 *   reviewCard(engine, cardId, correct, now?) -> beoordeelt (Good/Again) + dispergeert siblings
 *   maybeIntroduceProduction(engine, now?)-> maakt productiekaarten aan zodra toegestaan
 *   dueCards(engine, now?)                -> kaart-records die due zijn
 *   dueCount(engine, now?)                -> aantal due kaarten
 *   cardsWithNotes(engine)                -> [{ card, note }] voor overzichten
 *   dueInDays(card, now?)                 -> hele dagen tot due (kan negatief)
 *
 *   Hulp voor de UI:
 *   spellingHint(es)                      -> korte NL-hint klank vs. schrift
 *   todayStr(date?) / addDays(dateStr,n)  -> datumhelpers (ook door store/Home)
 */

import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs'
import { normalizeWord } from './contentLoader'

const DAY_MS = 24 * 60 * 60 * 1000

/*
 * De enige scheduler. desired_retention 0.9, fuzz aan, learning steps 1m/10m,
 * relearning 10m — exact zoals de spec (§1) voorschrijft. enable_short_term
 * moet aan staan, anders worden de learning steps genegeerd.
 */
const PARAMS = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
})
const scheduler = fsrs(PARAMS)

export const DIRECTIONS = { RECOGNITION: 'recognition', PRODUCTION: 'production' }

export function freshEngine() {
  return { notes: {}, cards: {}, log: [] }
}

/* ------------------------------------------------------------------ */
/*  Serialisatie: ts-fsrs werkt met Date-objecten, wij bewaren ISO.    */
/*  next() accepteert een CardInput met due/last_review als string en  */
/*  state als getal, dus de opgeslagen vorm kan er zó weer in.         */
/* ------------------------------------------------------------------ */
function serializeCard(card) {
  return {
    due: toISO(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? toISO(card.last_review) : null,
  }
}

function serializeLog(log) {
  return {
    rating: log.rating,
    state: log.state,
    due: toISO(log.due),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: toISO(log.review),
  }
}

function toISO(d) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}

function cardId(noteId, direction) {
  return noteId + ':' + direction
}

function siblingId(rec) {
  const other =
    rec.direction === DIRECTIONS.RECOGNITION ? DIRECTIONS.PRODUCTION : DIRECTIONS.RECOGNITION
  return cardId(rec.noteId, other)
}

function newCardRecord(id, noteId, direction, now) {
  return {
    id,
    noteId,
    direction,
    createdAt: toISO(now),
    fsrs: serializeCard(createEmptyCard(now)),
  }
}

/* ------------------------------------------------------------------ */
/*  introduceNote — nieuw woord start met ALLEEN de herkenningskaart    */
/*  (spec §2, harde regel 2: productie komt pas later).                */
/* ------------------------------------------------------------------ */
export function introduceNote(engine, note, now = new Date()) {
  const id = note.id || normalizeWord(note.es)
  const notes = engine.notes[id]
    ? engine.notes
    : {
        ...engine.notes,
        [id]: {
          id,
          kind: note.kind || 'word',
          es: note.es,
          nl: note.nl,
          exampleEs: note.exampleEs || null,
          clip: note.clip || null,
          audioUrl: note.audioUrl || null,
          sourceEpisodeId: note.sourceEpisodeId || null,
        },
      }

  const recogId = cardId(id, DIRECTIONS.RECOGNITION)
  if (engine.cards[recogId]) return { ...engine, notes }

  return {
    ...engine,
    notes,
    cards: { ...engine.cards, [recogId]: newCardRecord(recogId, id, DIRECTIONS.RECOGNITION, now) },
  }
}

/* ------------------------------------------------------------------ */
/*  reviewCard — één beoordeling: goed = Good, fout = Again.            */
/*  Roep dit precies één keer per kaart per sessie aan: de eerste       */
/*  poging telt (goed-na-fout binnen dezelfde sessie is géén extra      */
/*  review). De sessie-laag bewaakt dat, niet deze functie.            */
/* ------------------------------------------------------------------ */
export function reviewCard(engine, id, correct, now = new Date()) {
  const rec = engine.cards[id]
  if (!rec) return engine

  const grade = correct ? Rating.Good : Rating.Again
  // De opgeslagen fsrs-vorm is een geldige CardInput (ISO-strings + numerieke state).
  const { card, log } = scheduler.next(rec.fsrs, now, grade)

  let updated = { ...rec, fsrs: serializeCard(card) }
  updated = disperseFromSibling(engine, updated, now)

  return {
    ...engine,
    cards: { ...engine.cards, [id]: updated },
    log: [...engine.log, { cardId: id, at: toISO(now), ...serializeLog(log) }],
  }
}

/* ------------------------------------------------------------------ */
/*  Sibling-dispersie (harde regel 2 / spec §2).                        */
/*  Anki's "bury tot morgen" is onvoldoende; we spreiden echt.          */
/*                                                                      */
/*  We passen alléén de kaart aan die we net hebben ingepland (de       */
/*  "latere" beslissing) en alléén als beide siblings op dezelfde       */
/*  KALENDERDAG due zijn én de nieuwe due op dagschaal ligt (learning-  */
/*  step-minuten laten we met rust). De kaart schuift naar ongeveer     */
/*  het midden tussen nu en de sibling-due, met minimaal 1 dag ertussen.*/
/* ------------------------------------------------------------------ */
function disperseFromSibling(engine, rec, now) {
  const sib = engine.cards[siblingId(rec)]
  if (!sib) return rec
  if (rec.fsrs.scheduled_days < 1) return rec // nog in de leerfase: niet spreiden

  const myDue = new Date(rec.fsrs.due)
  const sibDue = new Date(sib.fsrs.due)
  if (!sameDay(myDue, sibDue)) return rec

  const nowMs = now.getTime()
  const sibMs = sibDue.getTime()
  const earliest = nowMs + DAY_MS // minstens 1 dag vanaf nu

  let targetMs
  if (sibMs - nowMs < 2 * DAY_MS) {
    // Sibling ligt te dichtbij om er nog tussen te passen: zet deze erná.
    targetMs = sibMs + DAY_MS
  } else {
    // Midden tussen nu en de sibling-due, geklemd op >=1 dag vóór de sibling.
    const mid = (nowMs + sibMs) / 2
    const latestBeforeSib = sibMs - DAY_MS
    targetMs = Math.min(Math.max(mid, earliest), latestBeforeSib)
  }

  return { ...rec, fsrs: { ...rec.fsrs, due: new Date(targetMs).toISOString() } }
}

/* ------------------------------------------------------------------ */
/*  maybeIntroduceProduction — gefaseerde introductie (harde regel 3).  */
/*  Een productiekaart ontstaat pas als de herkenningskaart de leerfase */
/*  voorbij is (State.Review) én er minstens 1 dag sinds de introductie */
/*  van de herkenningskaart verstreken is.                              */
/*  Roep dit aan bij het openen van een woordsessie / de Woorden-tab.   */
/* ------------------------------------------------------------------ */
export function maybeIntroduceProduction(engine, now = new Date()) {
  let cards = engine.cards
  let changed = false
  const nowMs = now.getTime()

  for (const noteId of Object.keys(engine.notes)) {
    const recog = cards[cardId(noteId, DIRECTIONS.RECOGNITION)]
    const prodId = cardId(noteId, DIRECTIONS.PRODUCTION)
    if (!recog || cards[prodId]) continue
    if (recog.fsrs.state !== State.Review) continue
    if (nowMs - new Date(recog.createdAt).getTime() < DAY_MS) continue

    cards = { ...cards, [prodId]: newCardRecord(prodId, noteId, DIRECTIONS.PRODUCTION, now) }
    changed = true
  }

  return changed ? { ...engine, cards } : engine
}

/* ------------------------------------------------------------------ */
/*  Selectors                                                           */
/* ------------------------------------------------------------------ */
export function dueCards(engine, now = new Date()) {
  const t = now.getTime()
  return Object.values(engine.cards).filter((c) => new Date(c.fsrs.due).getTime() <= t)
}

export function dueCount(engine, now = new Date()) {
  return dueCards(engine, now).length
}

/* Alle kaarten met hun note, gesorteerd op due (voor het Woorden-overzicht). */
export function cardsWithNotes(engine) {
  return Object.values(engine.cards)
    .map((card) => ({ card, note: engine.notes[card.noteId] }))
    .filter((x) => x.note)
    .sort((a, b) => new Date(a.card.fsrs.due) - new Date(b.card.fsrs.due))
}

/* Hele dagen tot de due-datum (negatief = achterstallig). */
export function dueInDays(card, now = new Date()) {
  const due = new Date(card.fsrs.due)
  const a = startOfDay(now).getTime()
  const b = startOfDay(due).getTime()
  return Math.round((b - a) / DAY_MS)
}

export function noteOf(engine, card) {
  return engine.notes[card.noteId]
}

/* ------------------------------------------------------------------ */
/*  retrievabilityOf — hoe waarschijnlijk de gebruiker deze kaart NU    */
/*  nog kent, volgens de FSRS-vergeetcurve (0..1). Nieuwe kaarten of    */
/*  kaarten zonder review geven 0 (ts-fsrs zelf: New -> 0).             */
/*  De opgeslagen fsrs-vorm is een geldige CardInput, dus die kan er    */
/*  rechtstreeks in. Gebruikt door de pre-teach (spec §4.1) om te       */
/*  bepalen of een woord al "bekend" genoeg is.                         */
/* ------------------------------------------------------------------ */
export function retrievabilityOf(cardRecord, now = new Date()) {
  if (!cardRecord || !cardRecord.fsrs) return 0
  return scheduler.get_retrievability(cardRecord.fsrs, now, false)
}

/* ------------------------------------------------------------------ */
/*  Spaans-specifieke uitspraakhint (spec §2, klank vs. schrift).       */
/*  Kort en simpel: benoem alleen wat in dit woord voorkomt.            */
/* ------------------------------------------------------------------ */
export function spellingHint(es) {
  const w = String(es || '').toLowerCase()
  const hints = []
  if (/[áéíóú]/.test(w)) hints.push('het accent (´) toont waar de klemtoon ligt')
  if (/ñ/.test(w)) hints.push('ñ klinkt als "nj" (zoals in oranje)')
  if (/ll/.test(w)) hints.push('ll klinkt als een "j"')
  if (/j/.test(w)) hints.push('j is een schrapende keel-"ch"')
  if (/g[eiéí]/.test(w)) hints.push('g vóór e/i klinkt ook als die schrapende "ch"')
  if (w.replace(/ch/g, '').includes('h'))
    hints.push('de h schrijf je wel, maar spreek je niet uit')
  if (/z|c[eiéí]/.test(w)) hints.push('z en c (vóór e/i) klinken als een zachte "s"')
  return hints.join(' · ')
}

/* ------------------------------------------------------------------ */
/*  Datumhelpers (blijven hier zodat srs.js kan verdwijnen).            */
/* ------------------------------------------------------------------ */
export function todayStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  return todayStr(new Date(d.getTime() + days * DAY_MS))
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
