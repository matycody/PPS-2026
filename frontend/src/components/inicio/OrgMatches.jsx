import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import MatchCard from '../MatchCard'
import { api } from '../../lib/api'
import { normMatch, courtLabel } from '../../lib/format'

const ACTIVE = ['LIVE', 'READY', 'SCHEDULED']
const CAL_BACK = 90 // días hacia atrás que se pueden elegir en el selector de fecha
const CAL_AHEAD = 180 // y hacia adelante
const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : null)
const RANK = { LIVE: 0, READY: 1, SCHEDULED: 2, SUSPENDED: 3, FINISHED: 4 }
// Orden en todas las listas: en vivo, habilitados, programados (y al final suspendidos/finalizados); dentro de cada grupo, por hora
const byStatus = (a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || byTime(a, b)
const byTime = (a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) || (a.court || 999) - (b.court || 999)

function dayLabel(day) {
  const d = new Date(day + 'T12:00:00')
  const diff = Math.round((new Date(day + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 864e5)
  const base = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return (diff === 0 ? 'Hoy · ' : diff === 1 ? 'Mañana · ' : '') + base
}

// Inicio: "Todos" = la jornada completa (programados, en vivo y finalizados juntos, cada uno con su estado);
// "Programados" = solo los que todavía no se jugaron;
// "En vivo" = partidos en curso y, por cancha, el que se juega y los que le siguen en esa cancha.
export default function OrgMatches({ byId, filter }) {
  const [sel, setSel] = useState('live') // 'live' = partidos en curso | número de cancha
  const [picked, setPicked] = useState([]) // ids de torneos elegidos; vacío = todos (pestaña Todos)
  const [open, setOpen] = useState(false) // desplegable de torneos
  const [dayPick, setDayPick] = useState(null) // fecha elegida (YYYY-MM-DD); null = próxima jornada
  const [dayOpen, setDayOpen] = useState(false) // desplegable de fechas
  const [courtPick, setCourtPick] = useState('all') // pestaña Programados: 'all' | número de cancha | 'none' (sin cancha)
  const [cal, setCal] = useState(null) // partidos de todas las fechas (pasadas y futuras)

  useEffect(() => {
    if ((filter !== 'all' && filter !== 'sched') || cal) return
    const iso = (d) => encodeURIComponent(new Date(Date.now() + d * 864e5).toISOString())
    api('GET', '/matches?status=LIVE,READY,SCHEDULED,SUSPENDED,FINISHED&limit=200&from=' + iso(-CAL_BACK) + '&to=' + iso(CAL_AHEAD))
      .then((r) => setCal(r.map(normMatch)))
      .catch(() => setCal([]))
  }, [filter, cal])

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

  if (filter === 'all' || filter === 'sched') {
    const sched = filter === 'sched'
    const inTab = (m) => (sched ? ['SCHEDULED', 'READY'].includes(m.status) : m.status !== 'CANCELLED')
    // Fechas disponibles (pasadas y futuras) con sus partidos; los datos en vivo pisan a los cargados
    const merged = new Map()
    ;(cal ?? []).forEach((m) => merged.set(m.id, byId[m.id] ?? m))
    Object.values(byId).forEach((m) => merged.set(m.id, m))
    const calDays = {}
    merged.forEach((m) => {
      const d = dayOf(m.scheduledAt)
      if (!d || !inTab(m)) return
      ;(calDays[d] ??= new Map()).set(m.id, m)
    })
    const dayKeys = Object.keys(calDays).sort()
    const today = dayOf(new Date())
    // Por defecto: Todos = hoy si hay partidos hoy (aunque ya terminaron), si no la próxima jornada; Programados = la próxima con pendientes
    const auto = sched
      ? dayKeys.find((d) => d >= today) ?? null
      : dayKeys.includes(today) ? today : dayKeys.find((d) => d >= today) ?? dayKeys[dayKeys.length - 1] ?? null
    const curDay = dayPick && dayKeys.includes(dayPick) ? dayPick : auto
    // Los en vivo / habilitados sin fecha también se muestran (arriba), en la jornada elegida
    const undated = !curDay || sched ? [] : [...merged.values()].filter((m) => !m.scheduledAt && ['LIVE', 'READY'].includes(m.status))
    const dayList = !curDay ? [] : [...calDays[curDay].values(), ...undated.filter((u) => !calDays[curDay].has(u.id))].sort(byStatus)
    const tournaments = []
    dayList.forEach((m) => {
      const id = m.tournament?.id ?? 'none'
      const t = tournaments.find((x) => x.id === id)
      if (t) t.n++
      else tournaments.push({ id, name: m.tournament?.name ?? 'Amistoso', n: 1 })
    })
    const cur = picked.filter((id) => tournaments.some((t) => t.id === id)) // ignora torneos que ya no están en la jornada
    const byTour = cur.length === 0 ? dayList : dayList.filter((m) => cur.includes(m.tournament?.id ?? 'none'))
    // Programados: subdividido por cancha, como En vivo (las canchas no son fijas; salen de los partidos de la jornada)
    const courtKey = (m) => (m.court ? m.court : 'none')
    const courtKeys = sched ? [...new Set(byTour.map(courtKey))].sort((a, b) => (a === 'none') - (b === 'none') || a - b) : []
    const courtCur = courtKeys.includes(courtPick) ? courtPick : 'all'
    const shown = sched && courtCur !== 'all' ? byTour.filter((m) => courtKey(m) === courtCur) : byTour
    const groups = sched && courtCur === 'all' && courtKeys.length > 1 ? courtKeys.map((k) => ({ k, list: byTour.filter((m) => courtKey(m) === k) })) : null
    const toggle = (id) => setPicked(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
    const summary = cur.length === 0 ? 'Todos' : cur.length === 1 ? tournaments.find((t) => t.id === cur[0])?.name : cur.length + ' torneos'
    const chip = (on) => 'rounded-full border px-3 py-1.5 text-xs font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <button
            onClick={() => setDayOpen((v) => !v)}
            aria-expanded={dayOpen}
            className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-muted"
          >
            <span className="min-w-0">
              {curDay ? 'Jornada · ' + dayLabel(curDay) + ' · ' + shown.length + (shown.length === 1 ? ' partido' : ' partidos') : sched ? 'Sin partidos programados' : 'Sin partidos'}
            </span>
            <ChevronDown size={18} className={'shrink-0 transition-transform ' + (dayOpen ? 'rotate-180' : '')} />
          </button>
          {dayOpen && (
            <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
              <Link to="/liga" className="block rounded-xl border border-line bg-surface-2 py-2.5 text-center text-sm font-bold text-accent">
                Ver calendario completo
              </Link>
              {cal === null && <p className="text-sm text-muted">Cargando fechas…</p>}
              <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                {dayKeys.map((d) => (
                  <button
                    key={d}
                    onClick={() => { setDayPick(d); setPicked([]); setDayOpen(false) }}
                    aria-pressed={d === curDay}
                    className={'rounded-full border px-3 py-1.5 text-xs font-bold ' + (d === curDay ? 'border-accent bg-accent text-black' : 'border-line bg-surface')}
                  >
                    {new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })} · {calDays[d].size}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
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
                <button onClick={() => setPicked([])} className={chip(cur.length === 0)}>Todos ({dayList.length})</button>
                {tournaments.map((t) => (
                  <button key={t.id} onClick={() => toggle(t.id)} aria-pressed={cur.includes(t.id)} className={chip(cur.includes(t.id))}>
                    {t.name} ({t.n})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {sched && courtKeys.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCourtPick('all')} className={chip(courtCur === 'all')}>Todas las canchas</button>
            {courtKeys.map((k) => (
              <button key={k} onClick={() => setCourtPick(k)} className={chip(courtCur === k)}>{courtLabel(k === 'none' ? 0 : k)}</button>
            ))}
          </div>
        )}
        {groups ? (
          groups.map((g) => (
            <div key={g.k} className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{courtLabel(g.k === 'none' ? 0 : g.k)} · {g.list.length} {g.list.length === 1 ? 'partido' : 'partidos'}</h2>
              {g.list.map((m) => <MatchCard key={m.id} m={m} />)}
            </div>
          ))
        ) : (
          <div className="space-y-3">{shown.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        )}
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
