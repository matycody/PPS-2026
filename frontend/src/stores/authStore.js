import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

let initialized = false

export const useAuthStore = create((set, get) => ({
  session: null,
  user: null, // { id, email, roles, profileId }
  menu: [],   // claves que decide el backend
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

  // Con sesión: GET /me crea/vincula el usuario local y devuelve roles + menú
  syncSession: async (session) => {
    if (!session) {
      set({ session: null, user: null, menu: [], loading: false })
      return
    }
    set({ session })
    try {
      const me = await api('GET', '/me')
      set({ user: me.user, menu: me.menu ?? [], loading: false })
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
