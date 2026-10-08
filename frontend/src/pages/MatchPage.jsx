import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Eye, X } from 'lucide-react'
import { api } from '../lib/api'
import { socket } from '../sockets/socket'
import { normMatch, MODALITY, BRANCH } from '../lib/format'
import StatusPill from '../components/StatusPill'
import Versus from '../components/Versus'
import MatchRoster from '../components/MatchRoster'
import { useWakeLock } from '../hooks/useWakeLock'

const showTime = (t) => (t ? t.replace(/^(\d):/, '0$1:') : '--:--')

function ClockCard({ label, time, paused, color }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className={'my-4 text-center font-mono text-[clamp(1.75rem,9vw,3rem)] font-extrabold tabular-nums ' + color}>{showTime(time)}</p>
      <p className={'rounded-full py-2 text-center text-xs font-bold uppercase ' + (paused ? 'bg-danger/15 text-danger' : 'bg-live/15 text-live')}>
        {paused ? 'Pausado' : 'En marcha'}
      </p>
    </div>
  )
}

function TimeoutBanner({ tick, nameA, nameB }) {
  const team = tick?.timeoutTeam
  if (!team) return null
  const expired = !tick.isTimeoutRunning
  return (
    <div className="rounded-3xl border border-warn/40 bg-warn/10 p-5 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-warn">Tiempo muerto - {team === 'A' ? nameA : nameB}</p>
      <p className={'my-3 font-mono text-[clamp(2rem,10vw,3.5rem)] font-extrabold tabular-nums ' + (expired ? 'text-danger' : 'text-warn')}>
        {showTime(tick.timeoutTime)}
      </p>
    </div>
  )
}

export default function MatchPage() {
  const { id } = useParams()
  const [m, setM] = useState(null)
  const [tick, setTick] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
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

  const second = Number(tick?.matchHalf) === 2

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <StatusPill status={m.status} />
        <p className="text-sm text-muted">Cancha {m.court} · {BRANCH[m.branch] ?? m.branch}</p>
      </div>



      {notice && (
        <button onClick={() => setNotice('')} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-left text-sm font-bold text-warn">
          {notice} <X size={16} className="shrink-0" />
        </button>
      )}

      <div className="rounded-3xl border border-line bg-surface p-5">
        <p className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-muted">Marcador</p>
        <Versus
          a={m.teamA}
          b={m.teamB}
          size="xl"
          center={
            <span className="font-mono text-4xl font-extrabold tabular-nums text-live">
              {m.score?.teamA ?? 0} <span className="text-lg text-muted">-</span> {m.score?.teamB ?? 0}
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ClockCard label="Partido" time={tick?.matchTime} paused={tick?.isMatchPaused ?? true} color="text-live" />
        <ClockCard label="Set" time={tick?.setTime} paused={tick?.isSetPaused ?? true} color="text-live" />
      </div>

      <TimeoutBanner tick={tick} nameA={m.teamA?.name ?? 'Equipo A'} nameB={m.teamB?.name ?? 'Equipo B'} />


      <div className="rounded-3xl border border-line bg-surface p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Estado del partido</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <span className="rounded-full bg-live/15 px-4 py-2 text-sm font-bold text-live">{MODALITY[m.modality] ?? m.modality}</span>
          {tick && (
            <span className="rounded-full bg-live/15 px-4 py-2 text-sm font-bold uppercase text-live">
              {second ? '2do tiempo' : '1er tiempo'}
            </span>
          )}
        </div>
      </div>

      <p className="flex items-center justify-center gap-2 border-t border-line pt-4 text-xs font-semibold uppercase tracking-wider text-muted">
        <Eye size={14} /> Vista en vivo · solo lectura
      </p>

      <MatchRoster teamA={m.teamA} teamB={m.teamB} branch={m.branch} />
    </div>
  )
}

