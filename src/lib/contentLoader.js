const base = import.meta.env.BASE_URL

const cache = new Map()

async function fetchJson(path) {
  if (cache.has(path)) return cache.get(path)
  // no-cache = altijd revalideren bij de server (ETag/304), zodat een nieuwe
  // deploy niet botst met tot 10 minuten oude content uit de browsercache.
  const res = await fetch(base + path, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Kon ${path} niet laden (${res.status})`)
  const data = await res.json()
  cache.set(path, data)
  return data
}

export function loadLadder() {
  return fetchJson('content/ladder.json')
}

export function loadEpisode(podcastId, episodeId) {
  return fetchJson(`content/episodes/${podcastId}/${episodeId}.json`)
}

/* Normaliseer een Spaans woord voor glossary-lookup: lowercase, zonder leestekens. */
export function normalizeWord(word) {
  return word
    .toLowerCase()
    .replace(/[¿?¡!.,;:"'«»()\[\]…–—-]/g, '')
    .trim()
}
