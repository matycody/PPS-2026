import { useEffect, useState } from 'react'
import { socket } from '../sockets/socket'

// Ultimo reloj conocido de cada partido en vivo, compartido por todas las tarjetas.
// Cuenta cuantas tarjetas miran cada partido: se une a la sala una vez y sale cuando ya nadie lo mira.
const ticks = new Map()
const subs = new Map()
const refs = new Map()
let wired = false

function wire() {
  if (wired) return
  wired = true
  socket.on('match:tick', (p) => {
    ticks.set(p.matchId, p)
    subs.get(p.matchId)?.forEach((cb) => cb(p))
  })
  socket.on('connect', () => {
    for (const id of refs.keys()) socket.emit('match:join', { matchId: id })
  })
}

// Mira el reloj de un partido sin hook (cuenta como una tarjeta más). Avisa el último tick conocido enseguida.
// Devuelve la función para dejar de mirar.
export function watchTick(matchId, cb) {
  wire()
  const n = (refs.get(matchId) ?? 0) + 1
  refs.set(matchId, n)
  if (n === 1 && socket.connected) socket.emit('match:join', { matchId })
  if (!subs.has(matchId)) subs.set(matchId, new Set())
  subs.get(matchId).add(cb)
  const last = ticks.get(matchId)
  if (last) cb(last)
  return () => {
    subs.get(matchId)?.delete(cb)
    const left = (refs.get(matchId) ?? 1) - 1
    if (left <= 0) {
      refs.delete(matchId)
      socket.emit('match:leave', { matchId })
    } else {
      refs.set(matchId, left)
    }
  }
}

export function useLiveTick(matchId, enabled = true) {
  const [tick, setTick] = useState(() => ticks.get(matchId) ?? null)

  useEffect(() => {
    if (!enabled || !matchId) return undefined
    return watchTick(matchId, setTick)
  }, [matchId, enabled])

  return tick
}
