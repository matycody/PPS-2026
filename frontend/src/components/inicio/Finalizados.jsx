import { useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Trophy } from 'lucide-react'
import { api } from '../../lib/api'
import { BRANCH, MODALITY, FORMAT, TSTATUS, normMatch, phaseCmp } from '../../lib/format'
import MatchCard from '../MatchCard'

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }) : 'Sin día')

// Jornadas de un torneo con sus partidos terminados y resultados
function Torneo({ t, onBack }) {
  const [days, setDays] = useState(null)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([
      api('GET', '/tournaments/' + t.id + '/matchdays'),
      api('GET', '/matches?tournamentId=' + t.id + '&status=FINISHED&limit=200'),
    ]).then(([d, m]) => { setDays(d); setDone(m) }).catch((e) => setErr(e.message))
  }, [t.id])

  const byId = new Map((done ?? []).map((m) => [m.id, m]))
  const inDay = new Set()
  const groups = (days ?? [])
    .map((d) => ({
      key: d.id,
      title: (d.stage?.name ? d.stage.name + ' · ' : '') + 'Fecha ' + d.number,
      date: d.date,
      list: d.matches.map((x) => byId.get(x.id)).filter(Boolean),
    }))
    .filter((g) => g.list.length)
  groups.forEach((g) => g.list.forEach((m) => inDay.add(m.id)))
  const extra = (done ?? []).filter((m) => !inDay.has(m.id))
  if (extra.length) groups.push({ key: 'extra', title: 'Playoffs y otros partidos', date: null, list: extra })

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-accent"><ChevronLeft size={16} /> Torneos</button>
      <div>
        <p className="font-bold">{t.name}{t.edition ? ' · ' + t.edition : ''} · {t.year}</p>
        <p className="text-sm text-muted">{FORMAT[t.format]} · {BRANCH[t.branch]} · {MODALITY[t.modality]}</p>
        {t.champion && <p className="mt-1 flex items-center gap-1 text-xs text-muted"><Trophy size={12} /> Campeón: {t.champion.name}</p>}
      </div>
      {err && <p className="text-danger">{err}</p>}
      {!days && !err && <p className="text-muted">Cargando…</p>}
      {days && groups.length === 0 && <p className="text-muted">Todavía no hay partidos terminados.</p>}
      {groups.map((g) => (
        <div key={g.key} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
            {g.title}{g.date ? ' · ' + fecha(g.date) : ''} · {g.list.length} {g.list.length === 1 ? 'partido' : 'partidos'}
          </h2>
          {g.list.map((m) => <MatchCard key={m.id} m={m} />)}
        </div>
      ))}
    </div>
  )
}

const HIST_DAYS = 365 // cuánto hacia atrás se buscan partidos terminados por jornada
const dayKey = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : 'none')
const dayTitle = (k) =>
  k === 'none' ? 'Sin fecha' : new Date(k + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// Partidos terminados agrupados por jornada (día), de todos los torneos y modalidades juntos
function PorJornada() {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null) // días abiertos; por defecto el más reciente

  useEffect(() => {
    const from = encodeURIComponent(new Date(Date.now() - HIST_DAYS * 864e5).toISOString())
    api('GET', '/matches?status=FINISHED&limit=200&from=' + from)
      .then((r) => setList(r.map(normMatch)))
      .catch((e) => setErr(e.message))
  }, [])

  const days = {}
  ;(list ?? []).forEach((m) => { (days[dayKey(m.scheduledAt)] ??= []).push(m) })
  const keys = Object.keys(days).sort((a, b) => (a === 'none') - (b === 'none') || b.localeCompare(a))
  const isOpen = (k) => (open ? open.includes(k) : k === keys[0])
  const toggle = (k) => setOpen((o) => { const cur = o ?? [keys[0]]; return cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] })

  return (
    <div className="space-y-3">
      {err && <p className="text-danger">{err}</p>}
      {list === null && !err && <p className="text-muted">Cargando…</p>}
      {list && keys.length === 0 && <p className="text-muted">Todavía no hay partidos terminados.</p>}
      {keys.map((k) => {
        const ms = days[k].sort((a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) || phaseCmp(a, b) || (a.court || 999) - (b.court || 999))
        return (
          <div key={k} className="space-y-3">
            <button
              onClick={() => toggle(k)}
              aria-expanded={isOpen(k)}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-muted"
            >
              <span className="min-w-0">{dayTitle(k)} · {ms.length} {ms.length === 1 ? 'partido' : 'partidos'}</span>
              <ChevronDown size={18} className={'shrink-0 transition-transform ' + (isOpen(k) ? 'rotate-180' : '')} />
            </button>
            {isOpen(k) && ms.map((m) => <MatchCard key={m.id} m={m} />)}
          </div>
        )
      })}
    </div>
  )
}

// Partidos terminados hoy, de cualquier torneo y modalidad (el más reciente primero)
function Hoy() {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const from = encodeURIComponent(new Date(Date.now() - 2 * 864e5).toISOString())
    api('GET', '/matches?status=FINISHED&limit=200&includeUndated=true&from=' + from)
      .then((r) => setList(r.map(normMatch)))
      .catch((e) => setErr(e.message))
  }, [])
  const today = new Date().toLocaleDateString('en-CA')
  const ms = (list ?? [])
    .filter((m) => dayKey(m.finishedAt ?? m.scheduledAt) === today)
    .sort((a, b) => String(b.finishedAt ?? b.scheduledAt ?? '').localeCompare(String(a.finishedAt ?? a.scheduledAt ?? '')))
  return (
    <div className="space-y-3">
      {err && <p className="text-danger">{err}</p>}
      {list === null && !err && <p className="text-muted">Cargando…</p>}
      {list && ms.length === 0 && <p className="text-muted">Hoy todavía no terminó ningún partido.</p>}
      {ms.length > 0 && <p className="text-xs font-bold uppercase tracking-widest text-muted">Hoy · {ms.length} {ms.length === 1 ? 'partido' : 'partidos'}</p>}
      {ms.map((m) => <MatchCard key={m.id} m={m} />)}
    </div>
  )
}

// Pestaña "Finalizados": torneos del semestre y, adentro, sus jornadas con resultados
export default function Finalizados() {
  const [list, setList] = useState(null)
  const [sel, setSel] = useState(null)
  const [view, setView] = useState('hoy') // 'hoy' | 'jornada' | 'torneo'
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', '/tournaments?limit=200').then(setList).catch((e) => setErr(e.message))
  }, [])

  if (sel) return <Torneo t={sel} onBack={() => setSel(null)} />
  const visible = (list ?? []).filter((t) => t.status !== 'DRAFT').sort((a, b) => b.year - a.year)
  const years = [...new Set(visible.map((t) => t.year))]

  const chip = (on) => 'rounded-full border px-3 py-1.5 text-xs font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setView('hoy')} className={chip(view === 'hoy')}>Hoy</button>
        <button onClick={() => setView('jornada')} className={chip(view === 'jornada')}>Por jornada</button>
        <button onClick={() => setView('torneo')} className={chip(view === 'torneo')}>Por torneo</button>
      </div>
      {view === 'hoy' && <Hoy />}
      {view === 'jornada' && <PorJornada />}
      {view === 'torneo' && <>
      {err && <p className="text-danger">{err}</p>}
      {list === null && !err && <p className="text-muted">Cargando…</p>}
      {list && visible.length === 0 && <p className="text-muted">No hay torneos para mostrar.</p>}
      {years.map((y) => (
        <div key={y} className="space-y-2">
          <p className="text-sm font-extrabold">{y}</p>
          {visible.filter((t) => t.year === y).map((t) => (
            <button key={t.id} onClick={() => setSel(t)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{t.name}{t.edition ? ' · ' + t.edition : ''}</p>
                <p className="text-sm text-muted">{FORMAT[t.format]} · {BRANCH[t.branch]} · {MODALITY[t.modality]}</p>
                <span className={'rounded-full px-2 py-0.5 text-xs font-bold uppercase ' + TSTATUS[t.status].cls}>{TSTATUS[t.status].label}</span>
              </div>
              <ChevronRight size={18} className="text-muted" />
            </button>
          ))}
        </div>
      ))}
      </>}
    </div>
  )
}
