import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { socket } from '../sockets/socket'

// Sanciones del partido (advertencias, tarjetas y expulsiones): carga inicial y cambios en vivo
export function useSanctions(matchId) {
  const [items, setItems] = useState([])
  useEffect(() => {
    if (!matchId) return undefined
    let alive = true
    const load = () => api('GET', '/matches/' + matchId + '/sanctions').then((r) => alive && setItems(r.items ?? [])).catch(() => {})
    load()
    const onSanctions = (p) => p.matchId === matchId && setItems(p.items ?? [])
    socket.on('match:sanctions', onSanctions)
    socket.on('connect', load)
    return () => { alive = false; socket.off('match:sanctions', onSanctions); socket.off('connect', load) }
  }, [matchId])
  return items
}
