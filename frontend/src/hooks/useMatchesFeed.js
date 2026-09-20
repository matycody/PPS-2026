import { useEffect } from 'react'
import { socket } from '../sockets/socket'
import { useMatchesStore } from '../stores/matchesStore'

// Feed general: lista inicial por REST + match:updated de todos los partidos
export function useMatchesFeed() {
  useEffect(() => {
    const { load, upsert } = useMatchesStore.getState()
    load()

    const subscribe = () => socket.emit('matches:subscribe')
    const onConnect = () => { subscribe(); load() } // tras reconectar se pierden las rooms
    const onUpdated = (p) => upsert(p)

    if (socket.connected) subscribe()
    socket.on('connect', onConnect)
    socket.on('match:updated', onUpdated)

    return () => {
      socket.off('connect', onConnect)
      socket.off('match:updated', onUpdated)
      socket.emit('matches:unsubscribe')
    }
  }, [])
}
