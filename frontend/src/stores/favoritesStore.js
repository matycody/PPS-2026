import { create } from 'zustand'
import { api } from '../lib/api'

// Favoritos de la persona (equipos y torneos) para ordenar y destacar el Inicio
export const useFavorites = create((set) => ({
  teams: new Set(),
  tournaments: new Set(),
  loaded: false,
  load: () =>
    api('GET', '/favorites')
      .then((rows) => set({
        teams: new Set(rows.filter((r) => r.targetType === 'TEAM').map((r) => r.targetId)),
        tournaments: new Set(rows.filter((r) => r.targetType === 'TOURNAMENT').map((r) => r.targetId)),
        loaded: true,
      }))
      .catch(() => set({ loaded: true })),
  clear: () => set({ teams: new Set(), tournaments: new Set(), loaded: false }),
}))
