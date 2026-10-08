import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ITEMS, GENERAL } from '../lib/navConfig'

export const DEFAULT_LOOK = { a: 30, da: 30, b: 12 }

// Aplica el orden guardado sin perder ítems: lo guardado va primero, lo nuevo al final
export function sortKeys(keys, saved) {
  if (!saved?.length) return keys
  const known = saved.filter((k) => keys.includes(k))
  return [...known, ...keys.filter((k) => !known.includes(k))]
}

// Tarjetas del inicio que le corresponden al usuario según su rol
export function availableCards(role, menu) {
  return [
    ...GENERAL.slice(0, 3),
    ...(role === 'Organizador' || role === 'Árbitro' || menu.includes('control_mesa') ? [ITEMS.control_mesa] : []),
    ...(menu.includes('usuarios') ? [ITEMS.usuarios] : []),
  ]
}

const patch = (s, uid, p) => ({ byUser: { ...s.byUser, [uid]: { ...s.byUser[uid], ...p } } })

export const useMenuPrefs = create(
  persist(
    (set) => ({
      byUser: {}, // { [userId]: { order: { [sección]: [claves] }, bottom: [claves], cards: [rutas] } }
      look: DEFAULT_LOOK, // transparencia y desenfoque (por dispositivo)
      setOrder: (uid, section, keys) => set((s) => patch(s, uid, { order: { ...s.byUser[uid]?.order, [section]: keys } })),
      setBottom: (uid, bottom) => set((s) => patch(s, uid, { bottom })),
      setCards: (uid, cards) => set((s) => patch(s, uid, { cards })),
      setLook: (p) => set((s) => ({ look: { ...s.look, ...p } })),
      reset: (uid) => set((s) => {
        const byUser = { ...s.byUser }
        delete byUser[uid]
        return { byUser, look: DEFAULT_LOOK }
      }),
    }),
    { name: 'menu-prefs' }
  )
)