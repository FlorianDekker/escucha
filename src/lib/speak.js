/*
 * Woorduitspraak voor woorden zonder podcast-clip.
 * Bronvolgorde: (1) SpanishDict-audio (natuurlijke TTS, onofficieel endpoint,
 * kan ooit stoppen), (2) de ingebouwde Spaanse stem van de browser als vangnet.
 * Uitspraak is leerinhoud, geen UI-effect: de geluidjes-instelling geldt hier niet.
 */

const cache = new Map()

function speechFallback(text) {
  try {
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'es-ES'
    u.rate = 0.95
    const voice = speechSynthesis.getVoices().find((v) => v.lang?.startsWith('es'))
    if (voice) u.voice = voice
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch {
    /* stil */
  }
}

export function playWord(text) {
  const word = String(text || '').trim()
  if (!word) return
  let audio = cache.get(word)
  if (!audio) {
    audio = new Audio(
      'https://audio1.spanishdict.com/audio?lang=es&text=' + encodeURIComponent(word.toLowerCase()),
    )
    audio.preload = 'auto'
    cache.set(word, audio)
  }
  audio.currentTime = 0
  audio.play().catch(() => speechFallback(word))
  audio.onerror = () => speechFallback(word)
}

/*
 * Speelt een fragment uit een aflevering-audio af (start..eind), met de native
 * woorduitspraak van playWord als vangnet. Eén gedeeld element zodat er nooit
 * twee clips over elkaar heen lopen.
 */
let clipEl = null
export function playClip(url, startSec, endSec, fallbackWord) {
  try {
    if (!clipEl) clipEl = new Audio()
    clipEl.pause()
    if (clipEl.dataset?.src !== url) {
      clipEl.src = url
      if (clipEl.dataset) clipEl.dataset.src = url
    }
    const stopper = () => {
      if (clipEl.currentTime >= endSec) {
        clipEl.pause()
        clipEl.removeEventListener('timeupdate', stopper)
      }
    }
    const start = () => {
      try {
        clipEl.currentTime = startSec
      } catch {
        /* seek kan mislukken vóór metadata; timeupdate vangt het op */
      }
      clipEl.removeEventListener('timeupdate', stopper)
      clipEl.addEventListener('timeupdate', stopper)
      clipEl.play().catch(() => speechFallback(fallbackWord))
    }
    if (clipEl.readyState >= 1) start()
    else clipEl.addEventListener('loadedmetadata', start, { once: true })
    clipEl.onerror = () => speechFallback(fallbackWord)
  } catch {
    if (fallbackWord) speechFallback(fallbackWord)
  }
}

/*
 * De vraagkant-audio van een woordkaart: gebruik de podcast-clip als die er is,
 * anders de losse native uitspraak (spec §F).
 */
export function playCardAudio(note) {
  if (!note) return
  if (note.clip && note.audioUrl && note.clip.startSec != null) {
    playClip(note.audioUrl, note.clip.startSec, note.clip.endSec, note.es)
    return
  }
  playWord(note.es)
}
