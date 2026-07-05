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
