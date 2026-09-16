import { create } from 'zustand'
import { socket } from '../sockets/socket'

export const useTimerStore = create((set, get) => ({
  matchId: null,
  matchTime: '20:00',
  setTime: '03:00',
  modality: 'foam',
  isMatchPaused: false,
  isSetPaused: false,
  pauseScope: null,
  currentHalf: 1,
  notifications: [],

  setMatchId: (matchId) => set({ matchId }),

  startTimer: (target = 'both') => {
    const { matchId } = get()
    if (!matchId) return
    socket.emit('match:start', { matchId, target })
  },

  pauseTimer: (target = 'both') => {
    const { matchId } = get()
    if (!matchId) return
    socket.emit('match:pause', { matchId, target })
  },

  resumeTimer: (target = 'both') => {
    const { matchId } = get()
    if (!matchId) return
    socket.emit('match:resume', { matchId, target })
  },

  pauseBoth: () => {
    const { matchId } = get()
    if (!matchId) return
    socket.emit('match:pause', { matchId, scope: 'individual', target: 'both' })
  },

  resetTimer: (timer) => {
    const { matchId } = get()
    if (!matchId) return
    socket.emit('match:reset', { matchId, timer })
  },

  setTimerValue: (timer, totalSeconds) => {
    const { matchId } = get()
    if (!matchId) return
    socket.emit('match:setTime', { matchId, timer, totalSeconds })
  },

  setModality: (modality) => {
    const { matchId } = get()
    if (!matchId) return
    set({ modality })
    socket.emit('match:setModality', { matchId, modality })
  },

  setHalf: (half) => {
    const { matchId } = get()
    if (!matchId) return
    socket.emit('match:setHalf', { matchId, half })
  },

  finishHalf: () => {
    const { matchId } = get()
    if (!matchId) return
    socket.emit('match:finishHalf', { matchId })
  },

  addNotification: (text) => {
    const id = Date.now() + Math.random()
    set((state) => ({ notifications: [...state.notifications, { id, text }] }))
  },

  removeNotification: (id) => {
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }))
  },
}))

socket.on('match:tick', ({ matchId, matchTime, setTime, isMatchPaused, isSetPaused, matchHalf }) => {
  if (useTimerStore.getState().matchId !== matchId) return
  useTimerStore.setState({ matchTime, setTime, isMatchPaused, isSetPaused, currentHalf: matchHalf })
})

socket.on('match:paused', ({ matchId, scope }) => {
  if (useTimerStore.getState().matchId !== matchId) return
  useTimerStore.setState({ pauseScope: scope })
})

socket.on('match:resumed', ({ matchId }) => {
  if (useTimerStore.getState().matchId !== matchId) return
  useTimerStore.setState({ pauseScope: null })
})

socket.on('match:setExpired', ({ matchId, message }) => {
  if (useTimerStore.getState().matchId !== matchId) return
  useTimerStore.getState().addNotification(message)
})

socket.on('match:ended', ({ matchId, message }) => {
  if (useTimerStore.getState().matchId !== matchId) return
  useTimerStore.getState().addNotification(message)
})

socket.on('match:finished', ({ matchId }) => {
  if (useTimerStore.getState().matchId !== matchId) return
  useTimerStore.getState().addNotification('SE TERMINÓ EL PARTIDO')
})