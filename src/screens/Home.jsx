import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { dueItems, todayStr } from '../lib/srs'
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

const artGradient =
  'repeating-linear-gradient(135deg,var(--accent),var(--accent) 9px,var(--accent-deep) 9px,var(--accent-deep) 18px)'

export default function Home() {
  const streak = useStore((s) => s.streak)
  const xp = useStore((s) => s.xp)
  const srs = useStore((s) => s.srs)
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
  const dueCount = dueItems(srs).length
  const goalTarget = 60
  const earnedToday = xp.byDate[todayStr()] || 0
  const goalPct = Math.min(100, Math.round((earnedToday / goalTarget) * 100))

  const level =
    (ladder && current && ladder.podcasts?.[podcastIdFor(ladder, current.unit.episodeId)]?.level) ||
    episode?.level ||
    'A1'
  const contTitle = episode?.title || current?.unit?.title || 'Aan de slag'
  const stepNr = current ? current.stepIndex + 1 : 0
  const stepTotal = currentUnitInfo?.total || 0
  const unitPct = stepTotal ? Math.round((currentUnitInfo.doneCount / stepTotal) * 100) : 0

  return (
    <div className="screen screen--brand">
      <div className="screen__scroll" style={{ padding: '18px 20px 16px' }}>
        {/* Begroeting + pills */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, color: 'var(--brand-soft)', fontWeight: 700, fontSize: 14 }}>{greeting}</p>
            <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 24, color: '#fff' }}>
              {NAME}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 9, flexShrink: 0 }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(255,255,255,.13)',
                padding: '6px 11px',
                borderRadius: 999,
                color: '#fff',
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              <span style={{ color: 'var(--gold)' }}>🔥</span>
              {streak.current}
            </span>
          </div>
        </div>

        {/* Ga-verder-kaart */}
        {current && (
          <Link
            to={`/session/${current.unit.id}/${current.step.id}`}
            className="card"
            style={{ display: 'block', marginTop: 18, padding: 16, textDecoration: 'none' }}
          >
            <div style={{ display: 'flex', gap: 14 }}>
              <div
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: 18,
                  flex: '0 0 auto',
                  background: artGradient,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: 'var(--accent)', fontWeight: 800, fontSize: 11, letterSpacing: '.08em' }}>
                  GA VERDER · {level}
                </p>
                <p
                  style={{
                    margin: '3px 0 0',
                    fontFamily: 'var(--font-head)',
                    fontWeight: 700,
                    fontSize: 17,
                    color: 'var(--ink)',
                    lineHeight: 1.15,
                  }}
                >
                  {contTitle}
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--ink-mute)', fontWeight: 700, fontSize: 12 }}>
                  Stap {stepNr} van {stepTotal}
                </p>
              </div>
            </div>
            <div style={{ marginTop: 13, display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ flex: 1, height: 9, borderRadius: 999, background: '#ECEAF6', overflow: 'hidden' }}>
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
        <p style={{ margin: '22px 4px 10px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15, color: '#fff' }}>
          Vandaag
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,.11)', borderRadius: 20, padding: 14 }}>
            <p style={{ margin: 0, color: 'var(--brand-soft)', fontWeight: 700, fontSize: 12 }}>Dagdoel</p>
            <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20, color: '#fff' }}>
              {earnedToday} / {goalTarget} XP
            </p>
            <div
              style={{
                marginTop: 8,
                height: 7,
                borderRadius: 999,
                background: 'rgba(255,255,255,.18)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ width: `${goalPct}%`, height: '100%', background: 'var(--gold)', animation: 'fillbar .7s ease' }}
              />
            </div>
          </div>
          <Link
            to="/words"
            style={{
              flex: 1,
              background: 'rgba(255,255,255,.11)',
              borderRadius: 20,
              padding: 14,
              textDecoration: 'none',
            }}
          >
            <p style={{ margin: 0, color: 'var(--brand-soft)', fontWeight: 700, fontSize: 12 }}>Woorden</p>
            <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20, color: '#fff' }}>
              {dueCount}
            </p>
            <p style={{ margin: '4px 0 0', color: 'var(--brand-mute)', fontWeight: 700, fontSize: 11 }}>te herhalen</p>
          </Link>
        </div>
      </div>

      <TabBar variant="dark" />
    </div>
  )
}
