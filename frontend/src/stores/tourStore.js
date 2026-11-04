import { create } from 'zustand'

// Cada tutorial se muestra una sola vez por persona y por dispositivo (al terminarlo o tocar la X queda marcado)
const PREFIX = 'tour-done:'
const doneKey = (uid, key) => PREFIX + (uid ?? 'guest') + ':' + key

export const tourSeen = (uid, key) => {
  try { return localStorage.getItem(doneKey(uid, key)) === '1' } catch { return true } // sin storage: no insiste
}
const markSeen = (uid, key) => {
  try { localStorage.setItem(doneKey(uid, key), '1') } catch { /* sin storage */ }
}
// Borra las marcas de esta persona para que los tutoriales vuelvan a salir
export const resetTours = (uid) => {
  try {
    const p = PREFIX + (uid ?? 'guest') + ':'
    Object.keys(localStorage).filter((k) => k.startsWith(p)).forEach((k) => localStorage.removeItem(k))
  } catch { /* sin storage */ }
}

export const useTourStore = create((set, get) => ({
  active: null, // { key, uid, steps, index }
  start: (key, steps, uid) => {
    if (!steps?.length) return
    set({ active: { key, uid: uid ?? null, steps, index: 0 } })
  },
  next: () => {
    const a = get().active
    if (!a) return
    if (a.index >= a.steps.length - 1) return get().close()
    set({ active: { ...a, index: a.index + 1 } })
  },
  prev: () => {
    const a = get().active
    if (!a || a.index === 0) return
    set({ active: { ...a, index: a.index - 1 } })
  },
  close: () => {
    const a = get().active
    if (a) markSeen(a.uid, a.key)
    set({ active: null })
  },
}))
