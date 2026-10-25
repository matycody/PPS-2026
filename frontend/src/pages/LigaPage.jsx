import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH, MODALITY, FORMAT, TSTATUS } from '../lib/format'
import { inputCls } from '../components/ui'

// Listado público de torneos, por año
export default function LigaPage() {
  const [list, setList] = useState(null)
  const [year, setYear] = useState('')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    const q = ['limit=200', year && 'year=' + year, status && 'status=' + status].filter(Boolean).join('&')
    api('GET', '/tournaments?' + q).then(setList).catch((e) => setErr(e.message))
  }, [year, status])

  const visible = (list ?? []).filter((t) => t.status !== 'DRAFT')
  const years = [...new Set(visible.map((t) => t.year))]

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Liga o copas</h1>
      <div className="grid grid-cols-2 gap-3 text-xs text-muted [&>*]:min-w-0">
        <label>Año<input type="number" className={inputCls} placeholder="Todos" value={year} onChange={(e) => setYear(e.target.value)} /></label>
        <label>Estado
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="ACTIVE">En curso</option>
            <option value="FINISHED">Finalizados</option>
          </select>
        </label>
      </div>
      {err && <p className="text-danger">{err}</p>}
      {list === null && !err && <p className="text-muted">Cargando…</p>}
      {list && visible.length === 0 && <p className="text-muted">No hay torneos para mostrar.</p>}
      {years.map((y) => (
        <div key={y} className="space-y-2">
          <p className="text-sm font-extrabold">{y}</p>
          {visible.filter((t) => t.year === y).map((t) => (
            <Link key={t.id} to={'/liga/' + t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{t.name}{t.edition ? ' · ' + t.edition : ''}</p>
                <p className="text-sm text-muted">{FORMAT[t.format]} · {BRANCH[t.branch]} · {MODALITY[t.modality]}</p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span className={'rounded-full px-2 py-0.5 font-bold uppercase ' + TSTATUS[t.status].cls}>{TSTATUS[t.status].label}</span>
                  {t.champion && <span className="flex items-center gap-1"><Trophy size={12} /> {t.champion.name}</span>}
                </p>
              </div>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}
