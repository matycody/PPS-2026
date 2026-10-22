import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import MatchCard from '../MatchCard'

const ACTIVE = ['LIVE', 'READY', 'SCHEDULED']
const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : null)
const byTime = (a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) || (a.court || 999) - (b.court || 999)

function dayLabel(day) {
  const d = new Date(day + 'T12:00:00')
  const diff = Math.round((new Date(day + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 864e5)
  const base = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return (diff === 0 ? 'Hoy · ' : diff === 1 ? 'Mañana · ' : '') + base
}

// Inicio de la organización: "Todos" = todos los partidos de la próxima jornada;
// "En vivo" = partidos en curso y, por cancha, el que se juega y los que le siguen en esa cancha.
export default function OrgMatches({ byId, filter }) {
  const [sel, setSel] = useState('live') // 'live' = partidos en curso | número de cancha
  const [picked, setPicked] = useState([]) // ids de torneos elegidos; vacío = todos (pestaña Todos)
  const [open, setOpen] = useState(false) // desplegable de torneos

  const { day, list, live, courts } = useMemo(() => {
    const today = dayOf(new Date())
    const all = Object.values(byId).filter((m) => ACTIVE.includes(m.status))
    const live = all.filter((m) => m.status === 'LIVE').sort(byTime)
    const days = all.filter((m) => m.scheduledAt && dayOf(m.scheduledAt) >= today).map((m) => dayOf(m.scheduledAt)).sort()
    const day = days[0] ?? null
    const list = day ? all.filter((m) => dayOf(m.scheduledAt) === day).sort(byTime) : []
    const courts = [...new Set([...list, ...live].map((m) => m.court).filter((c) => c != null))].sort((a, b) => a - b)
    return { day, list, live, courts }
  }, [byId])

  if (filter === 'all') {
    if (!day) return <p className="text-muted">No hay partidos programados.</p>
    const tournaments = []
    list.forEach((m) => {
      const id = m.tournament?.id ?? 'none'
      const t = tournaments.find((x) => x.id === id)
      if (t) t.n++
      else tournaments.push({ id, name: m.tournament?.name ?? 'Amistoso', n: 1 })
    })
    const cur = picked.filter((id) => tournaments.some((t) => t.id === id)) // ignora torneos que ya no están en la jornada
    const shown = cur.length === 0 ? list : list.filter((m) => cur.includes(m.tournament?.id ?? 'none'))
    const toggle = (id) => setPicked(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
    const summary = cur.length === 0 ? 'Todos' : cur.length === 1 ? tournaments.find((t) => t.id === cur[0])?.name : cur.length + ' torneos'
    const chip = (on) => 'rounded-full border px-3 py-1.5 text-xs font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')
    return (
      <div className="space-y-3">
        <Link to="/liga" className="block rounded-2xl border border-line bg-surface py-3 text-center text-sm font-bold text-accent">
          Ver calendario completo
        </Link>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
          Jornada · {dayLabel(day)} · {shown.length} {shown.length === 1 ? 'partido' : 'partidos'}
        </h2>
        {tournaments.length > 1 && (
          <div className="space-y-2">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm font-bold"
            >
              <span className="min-w-0 truncate">Torneos: <span className="text-accent">{summary}</span></span>
              <ChevronDown size={18} className={'shrink-0 text-muted transition-transform ' + (open ? 'rotate-180' : '')} />
            </button>
            {open && (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-3">
                <button onClick={() => setPicked([])} className={chip(cur.length === 0)}>Todos ({list.length})</button>
                {tournaments.map((t) => (
                  <button key={t.id} onClick={() => toggle(t.id)} aria-pressed={cur.includes(t.id)} className={chip(cur.includes(t.id))}>
                    {t.name} ({t.n})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="space-y-3">{shown.map((m) => <MatchCard key={m.id} m={m} />)}</div>
      </div>
    )
  }

  // En vivo
  const court = sel !== 'live' && courts.includes(sel) ? sel : 'live'
  const options = [{ id: 'live', label: 'Partidos en curso' }, ...courts.map((c) => ({ id: c, label: 'Cancha ' + c }))]
  const onCourt = court === 'live' ? [] : [...live.filter((m) => m.court === court), ...list.filter((m) => m.court === court && m.status !== 'LIVE')]
  const liveHere = onCourt.filter((m) => m.status === 'LIVE')
  const nextHere = onCourt.filter((m) => m.status !== 'LIVE')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => setSel(o.id)}
            className={'rounded-full border px-3 py-1.5 text-xs font-bold ' + (court === o.id ? 'border-accent bg-accent text-black' : 'border-line bg-surface')}
          >
            {o.label}
          </button>
        ))}
      </div>

      {court === 'live' ? (
        live.length ? <div className="space-y-4">{live.map((m) => <MatchCard key={m.id} m={m} featured />)}</div> : <p className="text-muted">No hay partidos en vivo.</p>
      ) : (
        <div className="space-y-4">
          {liveHere.length ? liveHere.map((m) => <MatchCard key={m.id} m={m} featured />) : <p className="text-muted">No hay un partido en vivo en la cancha {court}.</p>}
          {nextHere.length > 0 && (
            <>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Próximos en la cancha {court}</h2>
              <div className="space-y-3">{nextHere.map((m) => <MatchCard key={m.id} m={m} />)}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
