import { useState } from 'react'
import { useStore } from '../lib/store'
import { playClick } from '../lib/sounds'
import TabBar from '../components/TabBar.jsx'
import '../overview.css'

const THEMES = [
  { key: 'aubergine', color: '#6A3E8E', label: 'Aubergine' },
  { key: 'indigo', color: '#4C4FD6', label: 'Indigo' },
  { key: 'groen', color: '#1F9E63', label: 'Groen' },
  { key: 'oceaan', color: '#2C6FB0', label: 'Oceaan' },
]

const SPEEDS = [0.75, 1, 1.25]

function Stat({ value, label }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 24, color: 'var(--ink)' }}>
        {value}
      </p>
      <p style={{ margin: '3px 0 0', color: 'var(--ink-mute)', fontWeight: 700, fontSize: 11.5 }}>{label}</p>
    </div>
  )
}

export default function Profile() {
  const settings = useStore((s) => s.settings)
  const streak = useStore((s) => s.streak)
  const xp = useStore((s) => s.xp)
  const srs = useStore((s) => s.srs)
  const episodes = useStore((s) => s.episodes)
  const setSetting = useStore((s) => s.setSetting)
  const exportData = useStore((s) => s.exportData)
  const importData = useStore((s) => s.importData)

  const [importText, setImportText] = useState('')
  const [notice, setNotice] = useState(null) // { kind: 'ok'|'err', text }

  const wordCount = Object.keys(srs).length
  const completedEpisodes = Object.values(episodes).filter((e) => e.status === 'completed').length

  async function handleExport() {
    const json = exportData()
    try {
      await navigator.clipboard.writeText(json)
      setNotice({ kind: 'ok', text: 'Gekopieerd naar klembord!' })
    } catch {
      // Fallback via tijdelijke textarea
      try {
        const ta = document.createElement('textarea')
        ta.value = json
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setNotice({ kind: 'ok', text: 'Gekopieerd!' })
      } catch {
        setNotice({ kind: 'err', text: 'Kopiëren lukte niet. Kopieer handmatig uit het tekstvak.' })
      }
    }
  }

  function handleImport() {
    try {
      importData(importText.trim())
      setImportText('')
      setNotice({ kind: 'ok', text: 'Voortgang geïmporteerd!' })
    } catch {
      setNotice({ kind: 'err', text: 'Ongeldige gegevens. Controleer de gekopieerde tekst.' })
    }
  }

  const cardStyle = { padding: 18, marginBottom: 16 }
  const sectionTitle = {
    margin: '0 4px 10px',
    fontFamily: 'var(--font-head)',
    fontWeight: 700,
    fontSize: 15,
    color: 'var(--ink)',
  }

  return (
    <div className="screen screen--page">
      <div className="screen__scroll">
        <div className="brand-header">
          <p style={{ margin: 0, color: 'var(--brand-soft)', fontWeight: 800, fontSize: 11, letterSpacing: '.08em' }}>
            PROFIEL
          </p>
          <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 24 }}>Florian</p>
        </div>

        <div style={{ padding: '18px 20px 24px' }}>
          {/* Statistieken */}
          <div className="card" style={cardStyle}>
            <div style={{ display: 'flex' }}>
              <Stat value={xp.total} label="XP totaal" />
              <Stat value={`${streak.best} 🔥`} label="Langste streak" />
            </div>
            <div style={{ display: 'flex', marginTop: 16 }}>
              <Stat value={wordCount} label="Woorden" />
              <Stat value={completedEpisodes} label="Afleveringen af" />
            </div>
          </div>

          {/* Thema */}
          <p style={sectionTitle}>Thema</p>
          <div className="card" style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              {THEMES.map((t) => {
                const active = settings.theme === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setSetting('theme', t.key)}
                    aria-label={t.label}
                    aria-pressed={active}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: t.color,
                      border: active ? '3px solid #fff' : '3px solid transparent',
                      boxShadow: active ? `0 0 0 3px ${t.color}` : '0 2px 6px rgba(20,22,58,.15)',
                      cursor: 'pointer',
                    }}
                  />
                )
              })}
            </div>
          </div>

          {/* Snelheid */}
          <p style={sectionTitle}>Afspeelsnelheid</p>
          <div className="card" style={cardStyle}>
            <div className="segmented">
              {SPEEDS.map((v) => (
                <button
                  key={v}
                  data-active={settings.playbackRate === v}
                  onClick={() => setSetting('playbackRate', v)}
                >
                  {v}×
                </button>
              ))}
            </div>
          </div>

          {/* Geluid */}
          <p style={sectionTitle}>Geluidseffecten</p>
          <div className="card" style={cardStyle}>
            <div className="segmented">
              <button
                data-active={settings.sounds !== false}
                onClick={() => {
                  setSetting('sounds', true)
                  playClick()
                }}
              >
                Aan
              </button>
              <button data-active={settings.sounds === false} onClick={() => setSetting('sounds', false)}>
                Uit
              </button>
            </div>
          </div>

          {/* Admin */}
          <p style={sectionTitle}>Admin</p>
          <div className="card" style={cardStyle}>
            <p style={{ margin: '0 0 10px', color: 'var(--ink-mute)', fontWeight: 700, fontSize: 12.5, lineHeight: 1.5 }}>
              Alle lessen ontgrendeld: het leerpad toont alle units en elke stap is direct
              speelbaar, ongeacht je voortgang.
            </p>
            <div className="segmented">
              <button
                data-active={settings.unlockAll === true}
                onClick={() => {
                  playClick()
                  setSetting('unlockAll', true)
                }}
              >
                Aan
              </button>
              <button
                data-active={!settings.unlockAll}
                onClick={() => {
                  playClick()
                  setSetting('unlockAll', false)
                }}
              >
                Uit
              </button>
            </div>
          </div>

          {/* Back-up */}
          <p style={sectionTitle}>Back-up</p>
          <div className="card" style={cardStyle}>
            <button className="btn-accent" onClick={handleExport}>
              Exporteer voortgang
            </button>
            <p style={{ margin: '16px 0 8px', color: 'var(--ink-mute)', fontWeight: 700, fontSize: 12.5 }}>
              Importeren: plak hier je eerder gekopieerde voortgang.
            </p>
            <textarea
              className="io"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{ "schemaVersion": 1, ... }'
            />
            <button
              className="btn-ghost"
              style={{ marginTop: 10, width: '100%' }}
              disabled={!importText.trim()}
              onClick={handleImport}
            >
              Importeer
            </button>
            {notice && (
              <p
                style={{
                  margin: '12px 0 0',
                  fontWeight: 800,
                  fontSize: 13,
                  color: notice.kind === 'ok' ? 'var(--good)' : 'var(--accent)',
                }}
              >
                {notice.text}
              </p>
            )}
          </div>

          <p
            style={{
              margin: '10px 4px 0',
              color: 'var(--ink-faint)',
              fontWeight: 600,
              fontSize: 11.5,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Audio en transcripts © de makers van de podcasts
          </p>
        </div>
      </div>

      <TabBar variant="light" />
    </div>
  )
}
