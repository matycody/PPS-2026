import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

let initialized = false
let profileTimer = null

// Sesión: dura mientras el dispositivo se use. Si pasa 1 mes sin abrir la web en ese dispositivo, se cierra.
// Cada dispositivo es independiente (se puede tener la misma cuenta en varios a la vez).
const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000
const ACTIVE_KEY = 'lastActiveAt'
const readActive = () => { try { return Number(localStorage.getItem(ACTIVE_KEY)) || 0 } catch { return 0 } }
const touchActive = () => { try { localStorage.setItem(ACTIVE_KEY, String(Date.now())) } catch { /* sin storage */ } }

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

    let { data } = await supabase.auth.getSession()
    // Un mes sin entrar desde este dispositivo: se cierra solo la sesión de acá (las demás siguen)
    const last = readActive()
    if (data.session && last && Date.now() - last > INACTIVITY_MS) {
      await supabase.auth.signOut({ scope: 'local' })
      data = { session: null }
    }
    touchActive()
    // Mientras la web está abierta o vuelve a primer plano, se renueva la marca de actividad (como mucho cada 10 min)
    let lastTouch = Date.now()
    const keepAlive = () => { if (Date.now() - lastTouch > 10 * 60 * 1000) { lastTouch = Date.now(); touchActive() } }
    window.addEventListener('focus', keepAlive)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAlive() })
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
        await supabase.auth.signOut({ scope: 'local' }) // solo este dispositivo
      } else {
        set({ user: null, menu: [], loading: false })
      }
    }
  },

  // Acepta mail o nombre de usuario. Con usuario, el backend resuelve el mail (nunca llega al navegador).
  signIn: async (identifier, password) => {
    if (identifier.includes('@')) {
      const { error } = await supabase.auth.signInWithPassword({ email: identifier, password })
      if (error) throw error
      return
    }
    const t = await api('POST', '/auth/login', { identifier, password })
    const { error } = await supabase.auth.setSession({ access_token: t.access_token, refresh_token: t.refresh_token })
    if (error) throw error
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut({ scope: 'local' }) // cerrar sesión acá no cierra las de otros dispositivos
  },
}))
