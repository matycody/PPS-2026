import { useState } from 'react'
import { Link } from 'react-router-dom'
import MatchCard from '../components/MatchCard'
import { useMatchesFeed } from '../hooks/useMatchesFeed'
import { useMatchesStore } from '../stores/matchesStore'
import { GENERAL } from '../lib/navConfig'

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'live', label: 'En vivo' },
  { id: 'sched', label: 'Programados' },
]
const ORDER = { LIVE: 0, READY: 1, SCHEDULED: 2 }

export default function InicioPage() {
  useMatchesFeed()
  const { byId, loading, error } = useMatchesStore()
  const [filter, setFilter] = useState('all')

  const all = Object.values(byId)
    .filter((m) => m.status in ORDER)
    .sort((a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) ||
      (a.court ?? 0) - (b.court ?? 0)
    )
  const live = all.filter((m) => m.status === 'LIVE')
  const sched = all.filter((m) => m.status !== 'LIVE')

  const featured = filter === 'sched' ? null : live[0]
  const list = filter === 'live' ? live.slice(1) : filter === 'sched' ? sched : all.filter((m) => m !== featured)

  return (
    <div className="space-y-5">
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none]">
        {GENERAL.slice(0, 3).map(({ to, label, Icon }) => (
          <Link key={to} to={to} className="flex w-28 shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-4 text-center text-sm font-semibold">
            <Icon size={22} className="text-accent" />
            {label}
          </Link>
        ))}
      </div>

      {featured && <MatchCard m={featured} featured />}

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

      <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
        {filter === 'live' ? 'Otros en vivo' : 'Próximos partidos'}
      </h2>

      {loading && <p className="text-muted">Cargando…</p>}
      {error && <p className="text-danger">{error}</p>}
      {!loading && !error && !featured && list.length === 0 && (
        <p className="text-muted">No hay partidos por ahora.</p>
      )}
      <div className="space-y-3">
        {list.map((m) => <MatchCard key={m.id} m={m} />)}
      </div>
    </div>
  )
}
