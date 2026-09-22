import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { socket } from '../../sockets/socket'
import { useMatchesFeed } from '../../hooks/useMatchesFeed'
import { useMatchesStore } from '../../stores/matchesStore'
import { fmtWhen } from '../../lib/format'
import StatusPill from '../../components/StatusPill'
import Versus from '../../components/Versus'

const ORDER = { LIVE: 0, READY: 1, SCHEDULED: 2 }
const pad = (t) => (t ? t.replace(/^(\d):/, '0$1:') : '--:--')

export default function DashboardPage() {
  useMatchesFeed()
  const { byId, loading, error } = useMatchesStore()
  const [ticks, setTicks] = useState({})

  const courts = useMemo(() => {
    const groups = {}
    Object.values(byId)
      .filter((m) => m.status in ORDER)
      .forEach((m) => { (groups[m.court] ??= []).push(m) })
    return Object.entries(groups)
      .map(([court, list]) => {
        list.sort((a, b) =>
          ORDER[a.status] - ORDER[b.status] || String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? ''))
        )
        return { court: Number(court), main: list[0], extra: list.length - 1 }
      })
      .sort((a, b) => a.court - b.court)
  }, [byId])

  // Relojes: solo los partidos en vivo (máx. 10, el límite es 12 suscripciones)
  const liveIds = courts.filter((c) => c.main.status === 'LIVE').slice(0, 10).map((c) => c.main.id).join(',')
  useEffect(() => {
    const ids = liveIds ? liveIds.split(',') : []
    const join = () => ids.forEach((id) => socket.emit('match:join', { matchId: id }))
    const onTick = (p) => setTicks((t) => ({ ...t, [p.matchId]: p }))
    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('match:tick', onTick)
    return () => {
      ids.forEach((id) => socket.emit('match:leave', { matchId: id }))
      socket.off('connect', join)
      socket.off('match:tick', onTick)
    }
  }, [liveIds])

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Dashboard de canchas</h1>
      {loading && <p className="text-muted">Cargando…</p>}
      {error && <p className="text-danger">{error}</p>}
      {!loading && !error && courts.length === 0 && <p className="text-muted">No hay partidos activos.</p>}

      {courts.map(({ court, main: m, extra }) => {
        const t = ticks[m.id]
        const paused = m.status === 'LIVE' && t?.isMatchPaused
        const center =
          m.status === 'LIVE' ? (
            <span className="font-mono text-2xl font-extrabold tabular-nums text-accent">{pad(t?.matchTime)}</span>
          ) : undefined
        return (
          <Link key={court} to={'/partido/' + m.id} className="block rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-muted">Cancha {court}</span>
              {paused ? (
                <span className="rounded-full bg-warn/15 px-3 py-1 text-xs font-bold uppercase text-warn">Pausado</span>
              ) : (
                <StatusPill status={m.status} />
              )}
            </div>
            <div className="mt-4">
              <Versus a={m.teamA} b={m.teamB} size="lg" center={center} />
            </div>
            <p className="mt-3 text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>
            {extra > 0 && <p className="mt-1 text-center text-xs text-muted">+{extra} más en esta cancha</p>}
          </Link>
        )
      })}
    </div>
  )
}
