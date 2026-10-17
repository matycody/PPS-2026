import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react'
import { api } from '../../lib/api'
import { BRANCH, MODALITY, FORMAT, TSTATUS } from '../../lib/format'
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

// Pestaña "Finalizados": torneos del semestre y, adentro, sus jornadas con resultados
export default function Finalizados() {
  const [list, setList] = useState(null)
  const [sel, setSel] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', '/tournaments?limit=200').then(setList).catch((e) => setErr(e.message))
  }, [])

  if (sel) return <Torneo t={sel} onBack={() => setSel(null)} />
  const visible = (list ?? []).filter((t) => t.status !== 'DRAFT').sort((a, b) => b.year - a.year)
  const years = [...new Set(visible.map((t) => t.year))]

  return (
    <div className="space-y-4">
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
    </div>
  )
}
