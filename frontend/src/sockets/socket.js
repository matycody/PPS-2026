import { io } from 'socket.io-client'
import { supabase } from '../lib/supabase'

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const NGROK = { 'ngrok-skip-browser-warning': 'true' }

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  extraHeaders: NGROK,
  transportOptions: { polling: { extraHeaders: NGROK } },
  // Se ejecuta en cada conexión: sin sesión entra como visitante
  auth: async (cb) => {
    const { data } = await supabase.auth.getSession()
    cb({ token: data.session?.access_token })
  },
})

// Reconectar cuando cambia el token (login, logout o renovación).
// El primer evento solo registra el estado inicial: el socket ya se conectó con él.
let seenInitial = false
let lastToken = null
supabase.auth.onAuthStateChange((_event, session) => {
  const token = session?.access_token ?? null
  if (!seenInitial) {
    seenInitial = true
    lastToken = token
    return
  }
  if (token === lastToken) return
  lastToken = token
  socket.disconnect().connect()
})

socket.on('connect', () => console.log('[socket] conectado:', socket.id))
socket.on('disconnect', (reason) => console.log('[socket] desconectado:', reason))
socket.on('connect_error', (err) => console.error('[socket] connect_error:', err.message))
socket.on('match:error', (p) => console.error('[socket] match:error', p))
