import { create } from 'zustand'
import { api } from '../lib/api'

// Escudos propios por rama de cada equipo: { [teamId]: { MALE: url, FEMALE: url } }
export const useTeamLogos = create((set, get) => ({
  map: {},
  loaded: false,
  refresh: () => { set({ loaded: false }); return get().load() },
  load: async () => {
    if (get().loaded) return
    try {
      const list = await api('GET', '/teams')
      set({ loaded: true, map: Object.fromEntries(list.filter((t) => t.branchLogos && Object.keys(t.branchLogos).length).map((t) => [t.id, t.branchLogos])) })
    } catch { /* sin escudos por rama: se usa el general */ }
  },
}))
