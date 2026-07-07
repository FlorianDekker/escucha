import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  freshEngine,
  introduceNote,
  reviewCard,
  maybeIntroduceProduction,
  todayStr,
} from './cards'

const SCHEMA_VERSION = 2
const XP_PER_CORRECT = 15
const XP_PER_TRY = 5
const MAX_STRUGGLES = 50

const initialState = {
  settings: { playbackRate: 1, theme: 'aubergine', dailyGoal: 3, sounds: true, unlockAll: false },
  streak: { current: 0, best: 0, lastActiveDate: null },
  xp: { total: 0, byDate: {} },
  episodes: {}, // epId -> { status, segmentIndexByStep, answers: {segId: {correct, attempts}}, scorePct, completedSteps: [] }
  // FSRS-6 leerengine: notes + kaarten (herkenning/productie) + append-only reviewlog.
  engine: freshEngine(),
  struggles: [], // { kind: 'segment', episodeId, segmentId, at }
  lastWeeklyReview: null,
}

/*
 * Migratie. v1 -> v2: het oude SM-2-veld `srs` vervalt volledig (bewuste keuze,
 * spec §1: schoon beginnen met één FSRS-scheduler). De rest blijft behouden.
 */
function migrate(persisted, version) {
  void version
  const next = { ...initialState, ...(persisted || {}) }
  delete next.srs
  if (!next.engine || !next.engine.notes) next.engine = freshEngine()
  return next
}

export const useStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      setSetting(key, value) {
        set((s) => ({ settings: { ...s.settings, [key]: value } }))
      },

      /* Streak bijwerken bij leeractiviteit; dag zonder activiteit reset naar 1. */
      touchStreak() {
        const today = todayStr()
        const { streak } = get()
        if (streak.lastActiveDate === today) return
        const yesterday = new Date(Date.now() - 864e5)
        const wasYesterday = streak.lastActiveDate === todayStr(yesterday)
        const current = wasYesterday ? streak.current + 1 : 1
        set({
          streak: { current, best: Math.max(current, streak.best), lastActiveDate: today },
        })
      },

      addXp(amount = XP_PER_CORRECT) {
        const today = todayStr()
        set((s) => ({
          xp: {
            total: s.xp.total + amount,
            byDate: { ...s.xp.byDate, [today]: (s.xp.byDate[today] || 0) + amount },
          },
        }))
      },

      ensureEpisode(episodeId) {
        const ep = get().episodes[episodeId]
        if (ep) return ep
        const fresh = { status: 'in_progress', segmentIndexByStep: {}, answers: {}, scorePct: null, completedSteps: [] }
        set((s) => ({ episodes: { ...s.episodes, [episodeId]: fresh } }))
        return fresh
      },

      answerSegment(episodeId, segmentId, correct) {
        get().ensureEpisode(episodeId)
        get().touchStreak()
        // Ook een foute poging levert wat XP op (¡Casi!-ontwerp uit het prototype).
        get().addXp(correct ? XP_PER_CORRECT : XP_PER_TRY)
        set((s) => {
          const ep = s.episodes[episodeId]
          const prev = ep.answers[segmentId] || { correct: false, attempts: 0 }
          const answers = {
            ...ep.answers,
            [segmentId]: { correct: prev.correct || correct, attempts: prev.attempts + 1, firstTryCorrect: prev.attempts === 0 ? correct : prev.firstTryCorrect },
          }
          let struggles = s.struggles
          if (!correct) {
            struggles = [
              { kind: 'segment', episodeId, segmentId, at: todayStr() },
              ...s.struggles,
            ].slice(0, MAX_STRUGGLES)
          }
          return { episodes: { ...s.episodes, [episodeId]: { ...ep, answers } }, struggles }
        })
      },

      /* Hervat-positie per stap (een aflevering heeft meerdere luisterdelen). */
      setSegmentIndex(episodeId, stepId, index) {
        get().ensureEpisode(episodeId)
        set((s) => {
          const ep = s.episodes[episodeId]
          return {
            episodes: {
              ...s.episodes,
              [episodeId]: {
                ...ep,
                segmentIndexByStep: { ...(ep.segmentIndexByStep || {}), [stepId]: index },
              },
            },
          }
        })
      },

      completeStep(episodeId, stepId) {
        get().ensureEpisode(episodeId)
        set((s) => {
          const ep = s.episodes[episodeId]
          if (ep.completedSteps.includes(stepId)) return {}
          return {
            episodes: {
              ...s.episodes,
              [episodeId]: { ...ep, completedSteps: [...ep.completedSteps, stepId] },
            },
          }
        })
      },

      setEpisodeScore(episodeId, scorePct) {
        get().ensureEpisode(episodeId)
        set((s) => ({
          episodes: {
            ...s.episodes,
            [episodeId]: {
              ...s.episodes[episodeId],
              scorePct,
              status: scorePct >= 80 ? 'completed' : 'in_progress',
            },
          },
        }))
      },

      /*
       * Leerengine (FSRS-6). Alle acties delegeren naar de pure functies in
       * cards.js; de store houdt alleen state + XP/streak-bijwerking bij.
       */

      /* Note introduceren (woordles of tap-op-woord). Maakt alleen de
         herkenningskaart aan; productie volgt gefaseerd via cards.js. */
      engineIntroduceNote(note) {
        set((s) => ({ engine: introduceNote(s.engine, note) }))
      },

      /* Eén beoordeling verwerken. Roep dit precies één keer per kaart per
         sessie aan (eerste poging telt). Goed levert XP op, net als voorheen. */
      engineReview(cardId, correct) {
        if (!get().engine.cards[cardId]) return
        get().touchStreak()
        if (correct) get().addXp(XP_PER_TRY)
        set((s) => ({ engine: reviewCard(s.engine, cardId, correct) }))
      },

      /* Productiekaarten aanmaken zodra hun herkenningskaart daar klaar voor is.
         Aanroepen bij het openen van een woordsessie of de Woorden-tab. */
      engineMaybeIntroduceProduction() {
        set((s) => ({ engine: maybeIntroduceProduction(s.engine) }))
      },

      setLastWeeklyReview(date) {
        set({ lastWeeklyReview: date })
      },

      exportData() {
        const { settings, streak, xp, episodes, engine, struggles, lastWeeklyReview } = get()
        return JSON.stringify(
          { schemaVersion: SCHEMA_VERSION, settings, streak, xp, episodes, engine, struggles, lastWeeklyReview },
          null,
          2,
        )
      },

      importData(json) {
        const data = migrate(JSON.parse(json), SCHEMA_VERSION)
        set(data)
      },
    }),
    {
      name: 'escucha.v1',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate,
      partialize: (s) => ({
        settings: s.settings,
        streak: s.streak,
        xp: s.xp,
        episodes: s.episodes,
        engine: s.engine,
        struggles: s.struggles,
        lastWeeklyReview: s.lastWeeklyReview,
      }),
    },
  ),
)

export { XP_PER_CORRECT, XP_PER_TRY }
