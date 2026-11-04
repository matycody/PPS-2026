import { useEffect, useRef } from 'react'
import { socket } from '../sockets/socket'

// Avisa cuando un torneo se pausa o se reanuda (evento tournament:updated), para recargar lo que se está mirando.
// onChange recibe { tournamentId, pausedAt }.
export function useTournamentLive(onChange) {
  const cb = useRef(onChange)
  cb.current = onChange
  useEffect(() => {
    const subscribe = () => socket.emit('matches:subscribe')
    const onUpdated = (p) => cb.current?.(p)
    socket.connect()
    if (socket.connected) subscribe()
    socket.on('connect', subscribe)
    socket.on('tournament:updated', onUpdated)
    return () => {
      socket.off('connect', subscribe)
      socket.off('tournament:updated', onUpdated)
      socket.emit('matches:unsubscribe')
    }
  }, [])
}
