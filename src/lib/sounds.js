import { useStore } from './store'

/*
 * Korte UI-geluidjes met minimale latency:
 *  - alle effecten worden bij het laden van de app alvast opgehaald en gedecodeerd
 *  - afspelen via de Web Audio API (AudioBufferSourceNode start vrijwel direct,
 *    in tegenstelling tot een HTMLAudioElement dat eerst moet bufferen)
 *  - fallback op een voorgeladen <audio>-element als Web Audio niet beschikbaar is
 * Afspelen gebeurt altijd vanuit een tap/click, dus autoplay-beleid is geen
 * probleem; fouten worden stil genegeerd (geluid mag nooit de flow breken).
 */
const base = import.meta.env.BASE_URL

const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
const ctx = Ctx ? new Ctx() : null

function makeSound(file, volume) {
  const url = base + 'sounds/' + file
  let buffer = null
  let fallback = null

  if (ctx) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((b) => {
        buffer = b
      })
      .catch(() => {})
  } else {
    fallback = new Audio(url)
    fallback.preload = 'auto'
    fallback.volume = volume
  }

  return () => {
    if (useStore.getState().settings.sounds === false) return
    try {
      if (ctx && buffer) {
        if (ctx.state === 'suspended') ctx.resume()
        const src = ctx.createBufferSource()
        src.buffer = buffer
        const gain = ctx.createGain()
        gain.gain.value = volume
        src.connect(gain)
        gain.connect(ctx.destination)
        src.start()
      } else if (fallback) {
        fallback.currentTime = 0
        fallback.play().catch(() => {})
      }
    } catch {
      /* geluid is nooit reden voor een kapotte flow */
    }
  }
}

export const playCorrect = makeSound('correct.mp3', 0.6)
export const playWrong = makeSound('wrong.mp3', 0.5)
export const playClick = makeSound('click.mp3', 0.5)
