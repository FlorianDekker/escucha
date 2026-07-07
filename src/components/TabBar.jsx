import { NavLink } from 'react-router-dom'
import { playClick } from '../lib/sounds'

/* Vier tabs met de SVG-iconen exact uit het design (viewBox 0 0 24 24). */
const TABS = [
  {
    to: '/',
    label: 'Thuis',
    end: true,
    icon: (
      <>
        <path d="M4 11l8-6 8 6" />
        <path d="M6 10v9h12v-9" />
      </>
    ),
  },
  {
    to: '/path',
    label: 'Leerpad',
    icon: (
      <>
        <circle cx="7" cy="6.2" r="2.2" />
        <circle cx="17" cy="17.8" r="2.2" />
        <path d="M7 8.6v2.2c0 2.6 3 2.2 5 3.6" />
      </>
    ),
  },
  {
    to: '/words',
    label: 'Woorden',
    icon: (
      <>
        <rect x="4" y="7" width="12" height="13" rx="2.5" />
        <path d="M8 4h9a1 1 0 0 1 1 1v10" />
      </>
    ),
  },
  {
    to: '/profile',
    label: 'Profiel',
    icon: (
      <>
        <circle cx="12" cy="8" r="3.3" />
        <path d="M5.5 19.5c0-3.6 3-5.6 6.5-5.6s6.5 2 6.5 5.6" />
      </>
    ),
  },
]

/*
 * Design handoff 4: de navigatiebalk is altijd de navy balk (var(--brand)),
 * actief in var(--gold) en inactief in var(--brand-mute). De 'variant'-prop
 * blijft bestaan voor compatibiliteit (o.a. LearningPath geeft variant="light"
 * mee), maar beide varianten renderen nu identiek.
 */
export default function TabBar({ variant = 'light' }) {
  void variant
  const activeColor = 'var(--gold)'
  const inactiveColor = 'var(--brand-mute)'

  return (
    <nav className="tabbar tabbar--nav">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className="tab"
          onClick={playClick}
          style={({ isActive }) => ({ color: isActive ? activeColor : inactiveColor })}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {t.icon}
          </svg>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
