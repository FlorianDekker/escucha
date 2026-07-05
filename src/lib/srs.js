/*
 * Vereenvoudigd SM-2 (Anki-achtig) voor woordherhaling.
 * Kwaliteit is binair: goed (q=5) of fout (q=2); dat is genoeg voor
 * meerkeuze/typen-oefeningen zonder zelfbeoordeling.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function newSrsItem(es, nl, sourceEpisodeId, today = todayStr()) {
  return {
    es,
    nl,
    easiness: 2.5,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    dueDate: today,
    sourceEpisodeId,
  }
}

export function review(item, correct, today = todayStr()) {
  const q = correct ? 5 : 2
  let { easiness, intervalDays, reps, lapses } = item

  easiness = Math.max(1.3, easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))

  if (!correct) {
    reps = 0
    lapses += 1
    intervalDays = 1
  } else {
    reps += 1
    if (reps === 1) intervalDays = 1
    else if (reps === 2) intervalDays = 3
    else intervalDays = Math.round(intervalDays * easiness)
  }

  const dueDate = addDays(today, intervalDays)
  return { ...item, easiness, intervalDays, reps, lapses, dueDate, lastReviewed: today }
}

export function isDue(item, today = todayStr()) {
  return item.dueDate <= today
}

export function dueItems(srs, today = todayStr()) {
  return Object.values(srs).filter((item) => isDue(item, today))
}

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
