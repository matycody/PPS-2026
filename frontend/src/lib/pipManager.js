// Reloj flotante global: un solo partido fijado a la vez, y sigue vivo aunque se cambie de página dentro de la app.
// Se puede fijar desde la tarjeta del partido o desde la página del partido.
import { socket } from '../sockets/socket'
import { normMatch } from './format'
import { watchTick } from './liveTicks'
import { startPip } from './pipClock'

let ctl = null
let activeId = null
let state = null
const listeners = new Set()
const emit = () => listeners.forEach((f) => f())

export const pipActiveId = () => activeId
export function subscribePip(f) {
  listeners.add(f)
  return () => listeners.delete(f)
}

// Fija el partido m; si ya estaba fijado lo suelta. Hay que llamarlo desde un toque del usuario.
export async function togglePip(m) {
  if (activeId === m.id) {
    ctl?.stop()
    return
  }
  ctl?.stop()
  const mine = { m, tick: null, at: Date.now() }
  state = mine
  activeId = m.id
  emit()
  const unwatch = watchTick(m.id, (t) => { mine.tick = t; mine.at = Date.now() })
  const onUpdated = (p) => { if ((p.matchId ?? p.id) === m.id) mine.m = { ...mine.m, ...normMatch(p) } }
  socket.on('match:updated', onUpdated)
  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    unwatch()
    socket.off('match:updated', onUpdated)
    if (state === mine) {
      state = null
      activeId = null
      ctl = null
      emit()
    }
  }
  try {
    ctl = await startPip(() => mine, cleanup)
  } catch (e) {
    cleanup()
    throw e
  }
}
