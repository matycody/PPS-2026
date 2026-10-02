import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { inputCls } from '../../components/ui'
import { fmtWhen } from '../../lib/format'

// Color del punto según el tipo de evento; lo que no reconozco queda gris
const DOT = {
  SET_ADD: 'bg-live',
  SET_REMOVE: 'bg-danger',
  MATCH_EDIT: 'bg-accent',
  MATCH_CANCEL: 'bg-danger',
}

export default function EdicionesPage() {
  const [matches, setMatches] = useState([])
  const [sel, setSel] = useState('')
  const [log, setLog] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { api('GET', '/matches?limit=200').then(setMatches).catch((e) => setErr(e.message)) }, [])
  useEffect(() => {
    if (!sel) return setLog(null)
    setErr('')
    api('GET', '/matches/' + sel + '/result-log').then(setLog).catch((e) => setErr(e.message))
  }, [sel])

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Registro de ediciones</h1>
      {err && <p className="text-danger">{err}</p>}
      <select className={inputCls} value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">Elegí un partido…</option>
        {matches.map((m) => (
          <option key={m.id} value={m.id}>
            {(m.teamA?.name ?? '—') + ' vs ' + (m.teamB?.name ?? '—') + ' · ' + fmtWhen(m.scheduledAt)}
          </option>
        ))}
      </select>

      {log?.length === 0 && <p className="text-muted">Sin actividad registrada en este partido.</p>}
      <div className="space-y-2">
        {(log ?? []).map((l, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
            <span className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (DOT[l.type] ?? 'bg-muted')} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{l.description}</p>
              <p className="mt-1 text-xs text-muted">{l.by} · {new Date(l.at).toLocaleString('es-AR')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
