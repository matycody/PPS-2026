import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  extraHeaders: {
    'ngrok-skip-browser-warning': 'true',
  },
})

socket.on('connect', () => {
  console.log('[socket] conectado:', socket.id)
})

socket.on('disconnect', (reason) => {
  console.log('[socket] desconectado:', reason)
})

socket.on('match:error', (payload) => {
  console.error('[socket] match:error', payload)
})