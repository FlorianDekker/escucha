import { useStore } from './store'

/*
 * Korte UI-geluidjes. Elk geluid heeft een eigen Audio-element dat wordt
 * hergebruikt (currentTime terug naar 0 bij opnieuw afspelen). Afspelen
 * gebeurt altijd vanuit een tap/click, dus autoplay-beleid is geen probleem;
 * fouten (bijv. iOS vlak na laden) worden stil genegeerd.
 */
const base = import.meta.env.BASE_URL

function makeSound(file, volume) {
  let audio = null
  return () => {
    if (useStore.getState().settings.sounds === false) return
    try {
      if (!audio) {
        audio = new Audio(base + 'sounds/' + file)
        audio.volume = volume
      }
      audio.currentTime = 0
      audio.play().catch(() => {})
    } catch {
      /* geluid is nooit reden voor een kapotte flow */
    }
  }
}

export const playCorrect = makeSound('correct.mp3', 0.6)
export const playWrong = makeSound('wrong.mp3', 0.5)
export const playClick = makeSound('click.mp3', 0.35)
