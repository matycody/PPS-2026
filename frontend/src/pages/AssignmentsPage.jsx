import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { socket } from '../sockets/socket'
import { normMatch, fmtWhen, courtLabel, BRANCH, MODALITY } from '../lib/format'
import { matchInfo } from '../lib/matchInfo'
import { inputCls } from '../components/ui'
import StatusPill from '../components/StatusPill'
import Versus from '../components/Versus'

const isPast = (s) => s === 'FINISHED' || s === 'CANCELLED'
const RANK = { LIVE: 0, READY: 1, SCHEDULED: 2, SUSPENDED: 3 }
const time = (iso) => (iso ? new Date(iso).getTime() : Infinity)
const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : 'none')
const dayTitle = (day, withYear) =>
  day === 'live'
    ? 'En vivo'
    : day === 'none'
    ? 'Sin fecha'
    : new Date(day + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) })

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
// Texto buscable de un partido: equipos, torneo, modalidad y rama (la fecha se filtra con el selector de día)
function haystack(m) {
  return plain([m.teamA?.name, m.teamB?.name, m.tournament?.name ?? 'Amistoso', MODALITY[m.modality], BRANCH[m.branch]].join(' '))
}

function Card({ m }) {
  const live = m.status === 'LIVE'
  const to = isPast(m.status) ? '/partido/' + m.id : '/control/' + m.id
  return (
    <Link to={to} className={'block rounded-3xl border bg-surface p-5 ' + (live ? 'border-accent' : 'border-line')}>
      <div className="flex items-center justify-between">
        <StatusPill status={m.status} />
        <span className="text-sm text-muted">{courtLabel(m.court)}</span>
      </div>
      <div className="mt-4"><Versus a={m.teamA} b={m.teamB} /></div>
      <p className="mt-3 text-center text-xs font-bold uppercase tracking-wider text-muted">{matchInfo(m)}</p>
      <p className="mt-1 text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>
      {!isPast(m.status) && (
        <div className={'mt-4 rounded-2xl py-3 text-center font-extrabold ' + (live ? 'bg-accent text-black' : 'bg-surface-2')}>
          Ir al control del partido
        </div>
      )}
    </Link>
  )
}

const chip = (on) => 'rounded-full border px-3 py-1.5 text-xs font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')

export default function AssignmentsPage({ fn }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('next') // 'next' | 'history'
  const [torneo, setTorneo] = useState('all')
  const [q, setQ] = useState('')
  const [date, setDate] = useState('')

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
  const history = tab === 'history'
  const whenOf = (m) => (history ? (m.finishedAt ?? m.scheduledAt) : m.scheduledAt)

  // Próximos: en vivo primero, Habilitados antes que Programados, y por hora. Historial: del más reciente al más viejo.
  const base = items
    .filter((m) => (history ? isPast(m.status) : !isPast(m.status)))
    .sort((a, b) => (history ? time(whenOf(b)) - time(whenOf(a)) : (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || time(a.scheduledAt) - time(b.scheduledAt)) || (a.court ?? 999) - (b.court ?? 999))

  const tournaments = []
  base.forEach((m) => {
    const id = m.tournament?.id ?? 'none'
    const t = tournaments.find((x) => x.id === id)
    if (t) t.n++
    else tournaments.push({ id, name: m.tournament?.name ?? 'Amistoso', n: 1 })
  })
  const cur = tournaments.some((t) => t.id === torneo) ? torneo : 'all'

  // Búsqueda: cada palabra tiene que aparecer (equipo, torneo, modalidad o rama); el día se filtra con el selector
  const words = plain(q).split(/\s+/).filter(Boolean)
  const shown = base
    .filter((m) => cur === 'all' || (m.tournament?.id ?? 'none') === cur)
    .filter((m) => !date || dayOf(whenOf(m)) === date)
    .filter((m) => { const h = words.length ? haystack(m) : ''; return words.every((w) => h.includes(w)) })

  // Una sección por torneo; adentro, en vivo primero y después un grupo por día
  const sections = []
  shown.forEach((m) => {
    const id = m.tournament?.id ?? 'none'
    let s = sections.find((x) => x.id === id)
    if (!s) sections.push((s = { id, name: m.tournament?.name ?? 'Amistoso', list: [], days: [] }))
    s.list.push(m)
    const d = !history && m.status === 'LIVE' ? 'live' : dayOf(whenOf(m))
    const g = s.days.find((x) => x.day === d)
    if (g) g.list.push(m)
    else s.days.push({ day: d, list: [m] })
  })
  const dayOrder = (a, b) => {
    if (a.day === 'live' || b.day === 'live') return a.day === 'live' ? -1 : 1
    if (a.day === 'none' || b.day === 'none') return a.day === 'none' ? 1 : -1
    return history ? b.day.localeCompare(a.day) : a.day.localeCompare(b.day)
  }
  sections.forEach((s) => s.days.sort(dayOrder))
  const key = (s) => (history ? -Math.max(...s.list.map((m) => time(whenOf(m)) === Infinity ? 0 : time(whenOf(m)))) : (s.list.some((m) => m.status === 'LIVE') ? -1 : Math.min(...s.list.map((m) => time(m.scheduledAt)))))
  sections.sort((a, b) => key(a) - key(b))

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">{title}</h1>
      {error && <p className="text-danger">{error}</p>}
      {list === null && !error && <p className="text-muted">Cargando…</p>}
      {list && items.length === 0 && <p className="text-muted">No tenés partidos asignados.</p>}

      {list && items.length > 0 && (
        <>
          <div className="flex gap-2">
            {[['next', 'Próximos'], ['history', 'Historial']].map(([id, label]) => (
              <button key={id} onClick={() => { setTab(id); setTorneo('all'); setQ(''); setDate('') }} className={'rounded-full border px-4 py-2 text-sm font-bold ' + (tab === id ? 'border-accent bg-accent text-black' : 'border-line bg-surface')}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className={inputCls} placeholder="Buscar equipo, modalidad o rama" value={q} onChange={(e) => setQ(e.target.value)} />
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Filtrar por día" />
          </div>

          {tournaments.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {[{ id: 'all', name: 'Todos', n: base.length }, ...tournaments].map((t) => (
                <button key={t.id} onClick={() => setTorneo(t.id)} className={chip(cur === t.id)}>{t.name} ({t.n})</button>
              ))}
            </div>
          )}

          {base.length === 0 && <p className="text-muted">{history ? 'Todavía no tenés partidos en el historial.' : 'Sin partidos próximos.'}</p>}
          {base.length > 0 && shown.length === 0 && <p className="text-muted">No hay partidos que coincidan con la búsqueda.</p>}

          {sections.map((s) => (
            <section key={s.id} className="space-y-4">
              <h2 className="border-b border-line pb-1 text-sm font-extrabold">{s.name} <span className="font-normal text-muted">· {s.list.length} {s.list.length === 1 ? 'partido' : 'partidos'}</span></h2>
              {s.days.map((g) => (
                <div key={g.day} className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{dayTitle(g.day, history)} · {g.list.length}</h3>
                  {g.list.map((m) => <Card key={m.id} m={m} />)}
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  )
}
