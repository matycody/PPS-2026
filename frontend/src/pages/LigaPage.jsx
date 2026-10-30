import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH, MODALITY, FORMAT, TSTATUS } from '../lib/format'
import TeamBadge from '../components/TeamBadge'
import FavHeart from '../components/FavHeart'

const chip = (on) => 'shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')

// Listado público de torneos: filtros rápidos, agrupados por año
export default function LigaPage() {
  const [list, setList] = useState(null)
  const [year, setYear] = useState('')
  const [status, setStatus] = useState('') // '' | ACTIVE | FINISHED
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', '/tournaments?limit=200').then(setList).catch((e) => setErr(e.message))
  }, [])

  const all = useMemo(() => (list ?? []).filter((t) => t.status !== 'DRAFT'), [list])
  const years = useMemo(() => [...new Set(all.map((t) => t.year))].sort((a, b) => b - a), [all])
  const visible = all.filter((t) => (!status || t.status === status) && (!year || String(t.year) === year))
  const groups = [...new Set(visible.map((t) => t.year))].sort((a, b) => b - a)

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Liga o copas</h1>

      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[['', 'Todos'], ['ACTIVE', 'En curso'], ['FINISHED', 'Finalizados']].map(([k, label]) => (
            <button key={k} onClick={() => setStatus(k)} className={chip(status === k)}>{label}</button>
          ))}
        </div>
        {years.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setYear('')} className={chip(year === '')}>Todos los años</button>
            {years.map((y) => <button key={y} onClick={() => setYear(String(y))} className={chip(year === String(y))}>{y}</button>)}
          </div>
        )}
      </div>

      {err && <p className="text-danger">{err}</p>}
      {list === null && !err && <p className="text-muted">Cargando…</p>}
      {list && visible.length === 0 && <p className="text-muted">No hay torneos para mostrar.</p>}

      {groups.map((y) => (
        <section key={y} className="space-y-2">
          <h2 className="text-sm font-extrabold">{y}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {visible.filter((t) => t.year === y).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-3">
                <Link to={'/liga/' + t.id} className="flex min-w-0 flex-1 items-center gap-3">
                  <TeamBadge team={{ name: t.name, logo: t.logo }} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{t.name}{t.edition ? ' · ' + t.edition : ''}</div>
                    <div className="truncate text-xs text-muted">{[BRANCH[t.branch], MODALITY[t.modality], FORMAT[t.format]].join(' · ')}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className={'rounded-full px-2 py-0.5 font-bold uppercase ' + TSTATUS[t.status].cls}>{TSTATUS[t.status].label}</span>
                      {t.champion && <span className="flex items-center gap-1 truncate text-muted"><Trophy size={12} /> {t.champion.name}</span>}
                    </div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
                <FavHeart type="TOURNAMENT" id={t.id} name={t.name} compact />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
