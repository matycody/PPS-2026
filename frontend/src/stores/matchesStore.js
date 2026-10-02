import { create } from 'zustand'
import { api } from '../lib/api'
import { normMatch } from '../lib/format'

export const useMatchesStore = create((set) => ({
  byId: {},
  loading: true,
  error: '',

  load: async () => {
    try {
      const list = await api('GET', '/matches?status=LIVE,READY,SCHEDULED&limit=200')
      const byId = {}
      list.forEach((m) => { byId[m.id] = normMatch(m) })
      set({ byId, loading: false, error: '' })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  upsert: (raw) => {
    const m = normMatch(raw)
    set((s) => ({ byId: { ...s.byId, [m.id]: { ...s.byId[m.id], ...m } } }))
  },
}))
