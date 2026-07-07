import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { dueCount, todayStr } from '../lib/cards'
import { loadLadder, loadEpisode } from '../lib/contentLoader'
import { computeProgress } from './LearningPath.jsx'
import TabBar from '../components/TabBar.jsx'
import '../overview.css'

const NAME = 'Florian'

function greetingFor(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Buenos días,'
  if (h < 18) return 'Buenas tardes,'
  return 'Buenas noches,'
}

// Podcast-id afleiden: de sleutel in ladder.podcasts waarmee de episodeId begint.
function podcastIdFor(ladder, episodeId) {
  const keys = Object.keys(ladder?.podcasts || {})
  return keys.find((k) => episodeId.startsWith(k)) || keys[0]
}

const ICON_URL = `${import.meta.env.BASE_URL}art/vamos-icon.png`
const ISLAND_URL = `${import.meta.env.BASE_URL}art/path/island.png`
const artAsset = (name) => `${import.meta.env.BASE_URL}art/path/${name}`

export default function Home() {
  const streak = useStore((s) => s.streak)
  const xp = useStore((s) => s.xp)
  const engine = useStore((s) => s.engine)
  const episodes = useStore((s) => s.episodes)

  const [ladder, setLadder] = useState(null)
  const [episode, setEpisode] = useState(null)

  useEffect(() => {
    loadLadder().then(setLadder).catch(() => setLadder({ units: [], podcasts: {} }))
  }, [])

  const progress = ladder ? computeProgress(ladder, episodes) : null
  const current = progress?.current
  const currentUnitInfo = progress ? progress.unitInfos[progress.currentUnitIndex] : null

  useEffect(() => {
    if (!ladder || !current) return
    const epId = current.unit.episodeId
    const pid = podcastIdFor(ladder, epId)
    loadEpisode(pid, epId)
      .then(setEpisode)
      .catch(() => setEpisode(null))
  }, [ladder, current])

  const greeting = greetingFor()
  const dueTodayCount = dueCount(engine)
  const goalTarget = 60
  const earnedToday = xp.byDate[todayStr()] || 0
  const goalPct = Math.min(100, Math.round((earnedToday / goalTarget) * 100))

  const level =
    (ladder && current && ladder.podcasts?.[podcastIdFor(ladder, current.unit.episodeId)]?.level) ||
    episode?.level ||
    'A1'
  const contTitle = episode?.title || current?.unit?.title || 'Aan de slag'
  const illustration = current?.unit?.illustration
  const stepNr = current ? current.stepIndex + 1 : 0
  const stepTotal = currentUnitInfo?.total || 0
  const unitPct = stepTotal ? Math.round((currentUnitInfo.doneCount / stepTotal) * 100) : 0

  return (
    <div className="screen screen--home">
      <div className="screen__scroll" style={{ padding: '8px 20px 16px' }}>
        {/* Begroeting + streak-pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <img
              src={ICON_URL}
              alt="Vamos!"
              style={{ width: 46, height: 46, objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.12))' }}
            />
            <div>
              <p style={{ margin: 0, color: '#4A6B57', fontWeight: 800, fontSize: 12.5 }}>{greeting}</p>
              <p style={{ margin: '1px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 22, color: 'var(--brand)', lineHeight: 1 }}>
                {NAME}
              </p>
            </div>
          </div>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: '#fff',
              padding: '7px 13px',
              borderRadius: 999,
              color: 'var(--brand)',
              fontWeight: 800,
              fontSize: 14,
              boxShadow: '0 6px 14px -6px rgba(20,40,90,.4)',
              flexShrink: 0,
            }}
          >
            <span style={{ color: 'var(--gold)' }}>🔥</span>
            {streak.current}
          </span>
        </div>

        {/* Ga-verder-kaart */}
        {current && (
          <Link
            to={`/session/${current.unit.id}/${current.step.id}`}
            style={{
              display: 'block',
              marginTop: 18,
              background: '#FFFDF7',
              borderRadius: 26,
              padding: 16,
              boxShadow: '0 18px 34px -16px rgba(20,40,90,.45)',
              border: '1px solid rgba(255,255,255,.7)',
              textDecoration: 'none',
            }}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 78, height: 78, flex: '0 0 auto', position: 'relative' }}>
                <img
                  src={ISLAND_URL}
                  alt=""
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 78,
                    filter: 'drop-shadow(0 6px 6px rgba(0,0,0,.12))',
                  }}
                />
                {illustration && (
                  <img
                    src={artAsset(illustration)}
                    alt=""
                    style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', width: 64 }}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'inline-block',
                    background: '#C98A46',
                    color: '#fff',
                    fontFamily: 'var(--font-head)',
                    fontWeight: 800,
                    fontSize: 9.5,
                    letterSpacing: '.06em',
                    padding: '3px 9px',
                    borderRadius: 8,
                    boxShadow: '0 2px 0 #8a5a28',
                  }}
                >
                  GA VERDER · {level}
                </span>
                <p
                  style={{
                    margin: '7px 0 0',
                    fontFamily: 'var(--font-head)',
                    fontWeight: 800,
                    fontSize: 17,
                    color: 'var(--brand)',
                    lineHeight: 1.1,
                  }}
                >
                  {contTitle}
                </p>
                <p style={{ margin: '3px 0 0', color: '#8A8AA8', fontWeight: 700, fontSize: 12 }}>
                  Stap {stepNr} van {stepTotal}
                </p>
              </div>
            </div>
            <div style={{ marginTop: 13, display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ flex: 1, height: 9, borderRadius: 999, background: '#ECEBE0', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${unitPct}%`,
                    height: '100%',
                    background: 'var(--accent)',
                    borderRadius: 999,
                    animation: 'fillbar .7s ease',
                  }}
                />
              </div>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 14px rgba(241,90,41,.45)',
                  flex: '0 0 auto',
                }}
              >
                <span className="play-tri" />
              </div>
            </div>
          </Link>
        )}

        {/* Vandaag */}
        <p style={{ margin: '22px 4px 10px', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 16, color: 'var(--brand)' }}>
          Vandaag
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: '#fff', borderRadius: 20, padding: 14, boxShadow: '0 10px 22px -14px rgba(20,40,90,.4)' }}>
            <p style={{ margin: 0, color: '#6B8574', fontWeight: 800, fontSize: 11.5 }}>Dagdoel</p>
            <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20, color: 'var(--brand)' }}>
              {earnedToday} / {goalTarget} XP
            </p>
            <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: '#EBECE2', overflow: 'hidden' }}>
              <div
                style={{ width: `${goalPct}%`, height: '100%', background: 'var(--gold)', animation: 'fillbar .7s ease' }}
              />
            </div>
          </div>
          <Link
            to="/words"
            style={{
              flex: 1,
              background: '#fff',
              borderRadius: 20,
              padding: 14,
              boxShadow: '0 10px 22px -14px rgba(20,40,90,.4)',
              textDecoration: 'none',
            }}
          >
            <p style={{ margin: 0, color: '#6B8574', fontWeight: 800, fontSize: 11.5 }}>Woorden</p>
            <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20, color: 'var(--brand)' }}>
              {dueTodayCount}
            </p>
            <p style={{ margin: '4px 0 0', color: '#A6ABB8', fontWeight: 700, fontSize: 11 }}>te herhalen</p>
          </Link>
        </div>
      </div>

      <TabBar variant="dark" />
    </div>
  )
}
