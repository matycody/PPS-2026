import { useEffect } from 'react'
import { socket } from '../sockets/socket'
import { useMatchesStore } from '../stores/matchesStore'

// Feed general: lista inicial por REST + match:updated de todos los partidos
export function useMatchesFeed(days) {
  useEffect(() => {
    const { load, upsert } = useMatchesStore.getState()
    load(days)

    const subscribe = () => socket.emit('matches:subscribe')
    const onConnect = () => { subscribe(); load(days) } // tras reconectar se pierden las rooms
    const onUpdated = (p) => upsert(p)
    const onTournament = () => load(days) // un torneo se pausó o reanudó: cambian los partidos visibles

    if (socket.connected) subscribe()
    socket.on('connect', onConnect)
    socket.on('match:updated', onUpdated)
    socket.on('tournament:updated', onTournament)

    return () => {
      socket.off('connect', onConnect)
      socket.off('match:updated', onUpdated)
      socket.off('tournament:updated', onTournament)
      socket.emit('matches:unsubscribe')
    }
  }, [])
}
