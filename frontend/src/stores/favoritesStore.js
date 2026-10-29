import { create } from 'zustand'
import { api } from '../lib/api'

// Favoritos de la persona (equipos y torneos) para ordenar y destacar el Inicio
export const useFavorites = create((set, get) => ({
  teams: new Set(),
  tournaments: new Set(),
  players: new Set(),
  loaded: false,
  load: () =>
    api('GET', '/favorites')
      .then((rows) => set({
        teams: new Set(rows.filter((r) => r.targetType === 'TEAM').map((r) => r.targetId)),
        tournaments: new Set(rows.filter((r) => r.targetType === 'TOURNAMENT').map((r) => r.targetId)),
        players: new Set(rows.filter((r) => r.targetType === 'PLAYER').map((r) => r.targetId)),
        loaded: true,
      }))
      .catch(() => set({ loaded: true })),
  // Seguir / dejar de seguir con respuesta inmediata; si el servidor falla, se vuelve atrás
  toggle: async (type, id) => {
    const field = type === 'TEAM' ? 'teams' : type === 'PLAYER' ? 'players' : 'tournaments'
    const on = get()[field].has(id)
    const flip = (add) => set((s) => { const n = new Set(s[field]); if (add) n.add(id); else n.delete(id); return { [field]: n } })
    flip(!on)
    try {
      if (on) await api('DELETE', '/favorites/' + type + '/' + id)
      else await api('POST', '/favorites', { targetType: type, targetId: id })
    } catch (e) {
      flip(on)
      throw e
    }
  },
  clear: () => set({ teams: new Set(), tournaments: new Set(), players: new Set(), loaded: false }),
}))
