import { supabase } from './supabase'
import { useThemeStore } from '../stores/themeStore'
import { usePersonalStore } from '../stores/personalStore'

// Sincroniza el tema y el color personal con la cuenta (user_metadata de Supabase),
// asi la misma cuenta se ve igual en el celular y en la compu. Sin sesion, queda local.
const MODES = ['light', 'dark', 'system']
let signedIn = false
let applying = false // evita volver a subir lo que acabamos de traer de la cuenta
let pushTimer = null
let lastPull = 0
let lastLocal = 0 // ultimo cambio hecho en este dispositivo

function pushToAccount() {
  if (applying) return
  lastLocal = Date.now()
  if (!signedIn) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    const { mode } = useThemeStore.getState()
    const { accent } = usePersonalStore.getState()
    const { error } = await supabase.auth.updateUser({ data: { pref_theme: mode, pref_accent: accent } })
    if (error) console.warn('[prefs] no se pudieron guardar en la cuenta:', error.message)
  }, 800)
}

function applyFromAccount(user) {
  const m = user?.user_metadata ?? {}
  if (m.pref_theme === undefined && m.pref_accent === undefined) {
    pushToAccount() // la cuenta todavia no tiene nada: se sube lo que ya tenia este dispositivo
    return
  }
  if (Date.now() - lastLocal < 3000) return // se acaba de cambiar aca: no pisarlo con datos viejos
  applying = true
  try {
    const theme = useThemeStore.getState()
    if (MODES.includes(m.pref_theme) && m.pref_theme !== theme.mode) theme.setMode(m.pref_theme)
    const personal = usePersonalStore.getState()
    const accent = m.pref_accent ?? null
    if (accent !== personal.accent) {
      if (accent) personal.setAccent(accent)
      else personal.clearAccent()
    }
  } finally {
    applying = false
  }
}

async function pull(force = false) {
  if (!signedIn) return
  const now = Date.now()
  if (!force && now - lastPull < 15000) return
  lastPull = now
  const { data, error } = await supabase.auth.getUser() // trae los datos frescos de la cuenta
  if (!error && data?.user) applyFromAccount(data.user)
}

useThemeStore.subscribe((s, prev) => { if (s.mode !== prev.mode) pushToAccount() })
usePersonalStore.subscribe((s, prev) => { if (s.accent !== prev.accent) pushToAccount() })

supabase.auth.onAuthStateChange((event, session) => {
  signedIn = !!session
  if (event === 'SIGNED_OUT') { clearTimeout(pushTimer); return }
  if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) setTimeout(() => pull(true), 0)
})

// Al volver a la pestana o a la app, se trae lo ultimo que se eligio en otro dispositivo
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pull()
})
