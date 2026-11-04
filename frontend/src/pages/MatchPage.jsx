import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { socket } from '../sockets/socket'
import { useSanctions } from '../hooks/useSanctions'
import { normMatch } from '../lib/format'
import { useWakeLock } from '../hooks/useWakeLock'
import { usePipClock } from '../hooks/usePipClock'
import MatchSpectator from '../components/match/MatchSpectator'

export default function MatchPage() {
  const { id } = useParams()
  const [m, setM] = useState(null)
  const [tick, setTick] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const sanctions = useSanctions(id)
  const pip = usePipClock(m)
  useWakeLock(!!tick && (!tick.isMatchPaused || !tick.isSetPaused || !!tick.isTimeoutRunning))

  useEffect(() => {
    api('GET', '/matches/' + id).then((x) => setM(normMatch(x))).catch((e) => setError(e.message))
  }, [id])

  useEffect(() => {
    const join = () => socket.emit('match:join', { matchId: id })
    const onTick = (p) => p.matchId === id && setTick(p)
    const onUpdated = (p) => (p.matchId ?? p.id) === id && setM((prev) => ({ ...prev, ...normMatch(p) }))
    const onMsg = (p) => p.matchId === id && setNotice(p.message || 'SE TERMINÓ EL PARTIDO')

    socket.connect()
    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('match:tick', onTick)
    socket.on('match:updated', onUpdated)
    socket.on('match:setExpired', onMsg)
    socket.on('match:finished', onMsg)
    socket.on('match:ended', onMsg)
    socket.on('match:timeoutExpired', onMsg)

    return () => {
      socket.emit('match:leave', { matchId: id })
      socket.off('connect', join)
      socket.off('match:tick', onTick)
      socket.off('match:updated', onUpdated)
      socket.off('match:setExpired', onMsg)
      socket.off('match:finished', onMsg)
      socket.off('match:ended', onMsg)
      socket.off('match:timeoutExpired', onMsg)
    }
  }, [id])

  if (error) return <p className="mt-10 text-center text-danger">{error}</p>
  if (!m) return <p className="mt-10 text-center text-muted">Cargando…</p>

  // Finalizado: solo si la mesa/árbitro lo finalizó o cerró
  const over = m.status === 'FINISHED' || !!tick?.matchEnded

  return <MatchSpectator m={m} tick={tick} over={over} notice={notice} onCloseNotice={() => setNotice('')} sanctions={sanctions} pip={pip} />
}
