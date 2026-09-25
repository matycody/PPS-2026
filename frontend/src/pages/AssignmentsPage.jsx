import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { socket } from '../sockets/socket'
import { normMatch, fmtWhen } from '../lib/format'
import StatusPill from '../components/StatusPill'
import Versus from '../components/Versus'

const isPast = (s) => s === 'FINISHED' || s === 'CANCELLED'
const ORDER = { LIVE: 0, READY: 1, SCHEDULED: 2 }

function Card({ m }) {
  const live = m.status === 'LIVE'
  const to = isPast(m.status) ? '/partido/' + m.id : '/control/' + m.id
  return (
    <Link to={to} className={'block rounded-3xl border bg-surface p-5 ' + (live ? 'border-accent' : 'border-line')}>
      <div className="flex items-center justify-between">
        <StatusPill status={m.status} />
        <span className="text-sm text-muted">Cancha {m.court}</span>
      </div>
      <div className="mt-4"><Versus a={m.teamA} b={m.teamB} /></div>
      <p className="mt-1 text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>
      {!isPast(m.status) && (
        <div className={'mt-4 rounded-2xl py-3 text-center font-extrabold ' + (live ? 'bg-accent text-black' : 'bg-surface-2')}>
          Ir al control del partido
        </div>
      )}
    </Link>
  )
}

export default function AssignmentsPage({ fn }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('GET', '/me/assignments').then(setList).catch((e) => setError(e.message))

    const sub = () => socket.emit('matches:subscribe')
    const onUpdated = (p) => {
      const u = normMatch(p)
      setList((prev) => prev && prev.map((a) => (a.match.id === u.id ? { ...a, match: { ...a.match, ...u } } : a)))
    }
    socket.connect()
    if (socket.connected) sub()
    socket.on('connect', sub)
    socket.on('match:updated', onUpdated)
    return () => {
      socket.off('connect', sub)
      socket.off('match:updated', onUpdated)
      socket.emit('matches:unsubscribe')
    }
  }, [])

  const items = (list ?? []).filter((a) => a.function === fn).map((a) => a.match)
  const title = fn === 'TABLE' ? 'Control de mesa' : 'Mis partidos asignados'

  const upcoming = items
    .filter((m) => !isPast(m.status))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')))
  const past = items
    .filter((m) => isPast(m.status))
    .sort((a, b) => String(b.finishedAt ?? b.scheduledAt ?? '').localeCompare(String(a.finishedAt ?? a.scheduledAt ?? '')))

  return (
    <div className="space-y-6">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">{title}</h1>
      {error && <p className="text-danger">{error}</p>}
      {list === null && !error && <p className="text-muted">Cargando…</p>}
      {list && items.length === 0 && <p className="text-muted">No tenés partidos asignados.</p>}

      {list && items.length > 0 && (
        <>
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-accent">Próximos</h2>
            {upcoming.length === 0 && <p className="text-sm text-muted">Sin partidos próximos.</p>}
            {upcoming.map((m) => <Card key={m.id} m={m} />)}
          </div>
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Jugados</h2>
            {past.length === 0 && <p className="text-sm text-muted">Todavía no jugaste ninguno.</p>}
            {past.map((m) => <Card key={m.id} m={m} />)}
          </div>
        </>
      )}
    </div>
  )
}
