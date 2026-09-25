import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MatchCard from '../components/MatchCard'
import { useMatchesFeed } from '../hooks/useMatchesFeed'
import { useMatchesStore } from '../stores/matchesStore'
import { socket } from '../sockets/socket'
import { toSeconds } from '../lib/format'
import { GENERAL, ITEMS } from '../lib/navConfig'
import { useAuthStore } from '../stores/authStore'
import { roleLabel } from '../lib/navConfig'

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'live', label: 'En vivo' },
  { id: 'sched', label: 'Programados' },
]
const ORDER = { LIVE: 0, READY: 1, SCHEDULED: 2 }
const SOON_SEC = 3 * 60 // el próximo partido de la cancha se agranda con 3 min o menos

export default function InicioPage() {
  useMatchesFeed()
  const { user, menu } = useAuthStore()
  const role = roleLabel(user, menu) // Organizador, Árbitro, Mesa, Jugador o Registrado
  const { byId, loading, error } = useMatchesStore()
  const [filter, setFilter] = useState('all')
  const [ticks, setTicks] = useState({})

  // Agrupa por cancha (la cantidad de canchas no es fija); dentro de cada una, en orden cronológico
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
        return { court: Number(court), list }
      })
      .sort((a, b) => a.court - b.court)
  }, [byId])

  // Reloj de cada partido en vivo, para saber cuándo está por terminar
  const liveIds = useMemo(
    () => courts.filter((c) => c.list[0]?.status === 'LIVE').map((c) => c.list[0].id).slice(0, 10),
    [courts]
  )
  const liveKey = liveIds.join(',')
  useEffect(() => {
    const join = () => liveIds.forEach((id) => socket.emit('match:join', { matchId: id }))
    const onTick = (p) => setTicks((t) => ({ ...t, [p.matchId]: p }))
    socket.connect()
    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('match:tick', onTick)
    return () => {
      liveIds.forEach((id) => socket.emit('match:leave', { matchId: id }))
      socket.off('connect', join)
      socket.off('match:tick', onTick)
    }
  }, [liveKey])

  // Una sección por cancha en vivo: el partido en curso y, si le queda poco, el que le sigue en esa cancha
  const liveSections = courts
    .filter((c) => c.list[0]?.status === 'LIVE')
    .map((c) => {
      const live = c.list[0]
      const next = c.list[1] && c.list[1].status !== 'LIVE' ? c.list[1] : null
      const left = toSeconds(ticks[live.id]?.matchTime)
      const promote = !!next && left != null && left <= SOON_SEC
      return { court: c.court, live, next: promote ? next : null }
    })

  const promotedIds = new Set(liveSections.filter((s) => s.next).map((s) => s.next.id))
  const upcoming = courts
    .flatMap((c) => c.list)
    .filter((m) => m.status !== 'LIVE' && !promotedIds.has(m.id))
    .sort((a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) || a.court - b.court)

  const showLive = filter !== 'sched'
  const showUpcoming = filter !== 'live'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-center gap-3">
        {[
          ...GENERAL.slice(0, 3),
          ...(role === 'Organizador' || role === 'Árbitro' || menu.includes('control_mesa') ? [ITEMS.control_mesa] : []),
          ...(menu.includes('usuarios') ? [ITEMS.usuarios] : []),
        ].map(({ to, label, Icon, soon }) => (
          <Link key={to} to={to} className="flex w-28 shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-4 text-center text-sm font-semibold">
            <Icon size={22} className="text-accent" />
            {label}
            {soon && <span className="text-[10px] font-bold uppercase text-muted">Próximamente</span>}
          </Link>
        ))}
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={
              'rounded-full border px-4 py-2 text-sm font-bold ' +
              (filter === f.id ? 'border-accent bg-accent text-black' : 'border-line bg-surface')
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-muted">Cargando…</p>}
      {error && <p className="text-danger">{error}</p>}

      {showLive && liveSections.length > 0 && (
        <div className="space-y-4">
          {liveSections.map(({ court, live, next }) => (
            <div key={court} className="space-y-3">
              <MatchCard m={live} featured />
              {next && <MatchCard m={next} featured badge="Arranca pronto" />}
            </div>
          ))}
        </div>
      )}
      {showLive && filter === 'live' && liveSections.length === 0 && !loading && !error && (
        <p className="text-muted">No hay partidos en vivo.</p>
      )}

      {showUpcoming && (
        <>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Próximos partidos</h2>
          {!loading && !error && upcoming.length === 0 && (
            <p className="text-muted">No hay partidos programados.</p>
          )}
          <div className="space-y-3">
            {upcoming.map((m) => <MatchCard key={m.id} m={m} />)}
          </div>
        </>
      )}
    </div>
  )
}




