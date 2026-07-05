import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useStore } from './lib/store'
import Home from './screens/Home.jsx'
import LearningPath from './screens/LearningPath.jsx'
import Words from './screens/Words.jsx'
import Profile from './screens/Profile.jsx'
import Session from './screens/Session.jsx'

export default function App() {
  const theme = useStore((s) => s.settings.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/path" element={<LearningPath />} />
        <Route path="/words" element={<Words />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/session/:unitId/:stepId" element={<Session />} />
      </Routes>
    </HashRouter>
  )
}
