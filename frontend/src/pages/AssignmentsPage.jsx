import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { socket } from '../sockets/socket'
import { normMatch, fmtWhen } from '../lib/format'
import StatusPill from '../components/StatusPill'

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
    if (socket.connected) sub()
    socket.on('connect', sub)
    socket.on('match:updated', onUpdated)
    return () => {
      socket.off('connect', sub)
      socket.off('match:updated', onUpdated)
      socket.emit('matches:unsubscribe')
    }
  }, [])

  const items = (list ?? []).filter((a) => a.function === fn)
  const title = fn === 'TABLE' ? 'Control de mesa' : 'Mis partidos asignados'

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">{title}</h1>
      {error && <p className="text-danger">{error}</p>}
      {list === null && !error && <p className="text-muted">Cargando…</p>}
      {list && items.length === 0 && <p className="text-muted">No tenés partidos asignados.</p>}

      {items.map(({ match: m }) => {
        const live = m.status === 'LIVE'
        return (
          <Link
            key={m.id}
            to={'/control/' + m.id}
            className={'block rounded-3xl border bg-surface p-5 ' + (live ? 'border-accent' : 'border-line')}
          >
            <div className="flex items-center justify-between">
              <StatusPill status={m.status} />
              <span className="text-sm text-muted">Cancha {m.court}</span>
            </div>
            <p className="mt-4 text-center text-lg font-extrabold">
              {m.teamA?.name ?? 'Por definir'} <span className="font-normal text-muted">vs</span> {m.teamB?.name ?? 'Por definir'}
            </p>
            <p className="mt-1 text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>
            <div className={'mt-4 rounded-2xl py-3 text-center font-extrabold ' + (live ? 'bg-accent text-black' : 'bg-surface-2')}>
              Ir al control del partido
            </div>
          </Link>
        )
      })}
    </div>
  )
}
