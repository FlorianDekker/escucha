import { useEffect, useRef, useState } from 'react'

/*
 * Eén hergebruikt <audio>-element per sessie (iOS: één keer unlocked door een tap
 * blijft bruikbaar). Auto-pauze: timeupdate als vangnet (fires ~4x/s) plus een
 * setTimeout op de resterende segmentduur voor een strakke stop.
 * Nooit Web Audio API of fetch op de audio-bytes gebruiken: de externe podcast-CDN's
 * sturen geen CORS-headers; het media-element zelf heeft die niet nodig.
 */
export function useSegmentPlayer(audioUrl) {
  const audioRef = useRef(null)
  const stopTimerRef = useRef(null)
  const segmentRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState(null)
  const [position, setPosition] = useState(0)
  // Expliciete einde-vlag: na pause() vuurt het element asynchroon nog een laatste
  // timeupdate met een positie nét vóór endSec, dus een positie-drempel is onbetrouwbaar.
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.src = audioUrl
    audioRef.current = audio

    const onTimeUpdate = () => {
      setPosition(audio.currentTime)
      const seg = segmentRef.current
      if (seg && audio.currentTime >= seg.endSec) stopAt(seg.endSec)
    }
    const onError = () => setError('De audio kan niet worden geladen. Controleer je verbinding.')
    const onPause = () => setIsPlaying(false)
    const onPlay = () => {
      setError(null)
      setIsPlaying(true)
    }
    const onEnded = () => setEnded(true)

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('error', onError)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('ended', onEnded)

    return () => {
      clearTimeout(stopTimerRef.current)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('ended', onEnded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  function stopAt(endSec) {
    const audio = audioRef.current
    if (!audio) return
    clearTimeout(stopTimerRef.current)
    audio.pause()
    if (audio.currentTime > endSec) audio.currentTime = endSec
    segmentRef.current = null
    setPosition(Math.max(audio.currentTime, endSec))
    setEnded(true)
  }

  function armStopTimer() {
    const audio = audioRef.current
    const seg = segmentRef.current
    if (!audio || !seg) return
    clearTimeout(stopTimerRef.current)
    const remaining = (seg.endSec - audio.currentTime) / (audio.playbackRate || 1)
    stopTimerRef.current = setTimeout(() => {
      const s = segmentRef.current
      if (s) stopAt(s.endSec)
    }, Math.max(0, remaining * 1000))
  }

  /* Speel [startSec, endSec] af; moet vanuit een user-tap worden aangeroepen (iOS). */
  async function playSegment(startSec, endSec, playbackRate = 1) {
    const audio = audioRef.current
    if (!audio) return
    try {
      segmentRef.current = { startSec, endSec }
      setEnded(false)
      audio.playbackRate = playbackRate
      audio.currentTime = startSec
      await audio.play()
      armStopTimer()
    } catch {
      setError('Afspelen lukt niet. Tik nog een keer om het opnieuw te proberen.')
      setIsPlaying(false)
    }
  }

  function pause() {
    clearTimeout(stopTimerRef.current)
    audioRef.current?.pause()
  }

  async function resume(playbackRate = 1) {
    const audio = audioRef.current
    if (!audio) return
    setEnded(false)
    audio.playbackRate = playbackRate
    await audio.play()
    armStopTimer()
  }

  function setRate(rate) {
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = rate
    if (!audio.paused) armStopTimer()
  }

  return { playSegment, pause, resume, setRate, isPlaying, position, ended, error }
}
