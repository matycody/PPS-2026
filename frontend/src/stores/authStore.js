import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

let initialized = false
let profileTimer = null

export const useAuthStore = create((set, get) => ({
  session: null,
  user: null, // { id, email, roles, profileId }
  menu: [],   // claves que decide el backend
  profile: null, // ficha propia (nombre, apodo, número, equipos) o null si no tiene
  photoUrl: null, // URL firmada de la foto propia (vence en 1 hora)
  loading: true,

  init: async () => {
    if (initialized) return
    initialized = true

    const { data } = await supabase.auth.getSession()
    await get().syncSession(data.session)

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      if (event === 'TOKEN_REFRESHED') return set({ session })
      // setTimeout evita bloquear el callback interno de Supabase
      setTimeout(() => get().syncSession(session), 0)
    })
  },

  // Ficha propia + foto (GET /me/profile). Se repite cada 45 min porque la URL de la foto vence a la hora.
  refreshProfile: async () => {
    if (!get().session) return
    try {
      const r = await api('GET', '/me/profile')
      set({ profile: r?.profile ?? null, photoUrl: r?.photoUrl ?? null })
    } catch {
      // sin conexión: queda lo que había
    }
  },
  refreshPhoto: () => get().refreshProfile(),

  // Con sesión: GET /me crea/vincula el usuario local y devuelve roles + menú
  syncSession: async (session) => {
    clearInterval(profileTimer)
    if (!session) {
      set({ session: null, user: null, menu: [], profile: null, photoUrl: null, loading: false })
      return
    }
    set({ session })
    try {
      const me = await api('GET', '/me')
      set({ user: me.user, menu: me.menu ?? [], loading: false })
      get().refreshProfile()
      profileTimer = setInterval(() => get().refreshProfile(), 45 * 60 * 1000)
    } catch (err) {
      console.error('[auth] GET /me falló:', err.message)
      if (err.status === 401) {
        await supabase.auth.signOut()
      } else {
        set({ user: null, menu: [], loading: false })
      }
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
  },
}))
