import { halfLabel } from '../lib/pipTime'
import { useEffect, useState } from 'react'
import FavHeart from '../components/FavHeart'
import { Link, useParams } from 'react-router-dom'
import { Eye, Pin, PinOff, Trophy, X } from 'lucide-react'
import { api } from '../lib/api'
import { socket } from '../sockets/socket'
import VenueInfo from '../components/VenueInfo'
import { normMatch, MODALITY, BRANCH, courtLabel } from '../lib/format'
import StatusPill from '../components/StatusPill'
import MatchNotice from '../components/MatchNotice'
import Versus from '../components/Versus'
import ScoreTimeline from '../components/ScoreTimeline'
import MatchRoster from '../components/MatchRoster'
import { useWakeLock } from '../hooks/useWakeLock'
import { usePipClock } from '../hooks/usePipClock'

const showTime = (t) => (t ? t.replace(/^(\d):/, '0$1:') : '--:--')

function ClockCard({ label, time, paused, color, finished }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className={'my-4 text-center font-mono text-[clamp(1.75rem,9vw,3rem)] font-extrabold tabular-nums ' + color}>{showTime(time)}</p>
      <p className={'rounded-full py-2 text-center text-xs font-bold uppercase ' + (finished ? 'bg-surface-2 text-muted' : paused ? 'bg-danger/15 text-danger' : 'bg-live/15 text-live')}>
        {finished ? 'Finalizado' : paused ? 'Pausado' : 'En marcha'}
      </p>
    </div>
  )
}

function TimeoutBanner({ tick, nameA, nameB }) {
  const team = tick?.timeoutTeam
  if (!team) return null
  const expired = !tick.isTimeoutRunning
  return (
    <div className="rounded-3xl border box-warn p-5 text-center">
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <StatusPill status={m.status} />
        <p className="text-sm text-muted">{courtLabel(m.court)} · {BRANCH[m.branch] ?? m.branch}</p>
        {m.venue && !over && <VenueInfo venue={m.venue} className="w-full max-w-sm" />}
        {m.tournament?.id && (
          <div className="flex items-center gap-2">
            <Link to={'/liga/' + m.tournament.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-bold text-accent">
              <Trophy size={14} /> {m.tournament.name} <span aria-hidden>›</span>
            </Link>
            <FavHeart type="TOURNAMENT" id={m.tournament.id} name={m.tournament.name} className="!h-8 !w-8" />
          </div>
        )}
      </div>
      <MatchNotice m={m} />



      {notice && (
        <button onClick={() => setNotice('')} className="flex w-full items-center justify-between gap-3 rounded-2xl border box-warn px-4 py-3 text-left text-sm font-bold text-warn">
          {notice} <X size={16} className="shrink-0" />
        </button>
      )}

      <div className="relative rounded-3xl border border-line bg-surface p-5">
        {pip.canPin && (
          <button
            type="button"
            onClick={pip.toggle}
            aria-label={pip.active ? 'Quitar reloj flotante' : 'Fijar reloj flotante'}
            aria-pressed={pip.active}
            className={'absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full ' + (pip.active ? 'text-live' : 'text-muted')}
          >
            {pip.active ? <PinOff size={18} /> : <Pin size={18} />}
          </button>
        )}
        <p className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-muted">Marcador</p>
        {pip.error && <p className="-mt-2 mb-3 text-center text-xs text-danger">{pip.error}</p>}
        {m.phase?.label && (
          <p className="-mt-2 mb-3 text-center text-xs font-bold uppercase tracking-widest text-accent">
            {m.phase.kind === 'LEAGUE' && m.phase.zone ? m.phase.zone + ' · ' : ''}{m.phase.label}
          </p>
        )}
        <Versus
          a={m.teamA}
          b={m.teamB}
          slotA={m.phase?.slotA}
          slotB={m.phase?.slotB}
          formA={m.form?.A}
          formB={m.form?.B}
          rankA={m.form?.rankA}
          rankB={m.form?.rankB}
          size="xl"
          fav
          center={
            <span className="font-mono text-4xl font-extrabold tabular-nums text-live">
              {m.score?.teamA ?? 0} <span className="text-lg text-muted">-</span> {m.score?.teamB ?? 0}
            </span>
          }
        />
        <ScoreTimeline m={m} />
      </div>

      {tick?.recovered && (
        <p className="rounded-2xl bg-warn/15 px-4 py-3 text-center text-sm font-bold text-warn">Reloj recuperado tras un reinicio del servidor: puede que el tiempo no sea exacto hasta que la mesa lo reanude.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ClockCard label="Partido" time={tick?.matchTime} paused={tick?.isMatchPaused ?? true} finished={over} color="text-live" />
        <ClockCard label="Set" time={tick?.setTime} paused={tick?.isSetPaused ?? true} finished={over} color="text-live" />
      </div>

      <TimeoutBanner tick={tick} nameA={m.teamA?.name ?? 'Equipo A'} nameB={m.teamB?.name ?? 'Equipo B'} />


      <div className="rounded-3xl border border-line bg-surface p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Estado del partido</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <span className="rounded-full bg-live/15 px-4 py-2 text-sm font-bold text-live">{MODALITY[m.modality] ?? m.modality}</span>
          {tick && (
            <span className="rounded-full bg-live/15 px-4 py-2 text-sm font-bold uppercase text-live">
              {halfLabel(tick)}
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

