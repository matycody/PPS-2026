import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { inputCls } from '../../components/ui'
import { fmtWhen } from '../../lib/format'

const pretty = (v) => {
  try { return JSON.stringify(JSON.parse(v)) } catch { return String(v ?? '—') }
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

      {log?.length === 0 && <p className="text-muted">Sin ediciones de resultado en este partido.</p>}
      <div className="space-y-2">
        {(log ?? []).map((l) => (
          <div key={l.id} className="space-y-1 rounded-2xl border border-line bg-surface p-4 text-sm">
            <p className="font-bold">{l.editor?.email ?? l.editedBy}</p>
            <p className="text-xs text-muted">{new Date(l.editedAt).toLocaleString('es-AR')}</p>
            <p className="break-all font-mono text-xs"><span className="text-danger">antes:</span> {pretty(l.oldValue)}</p>
            <p className="break-all font-mono text-xs"><span className="text-live">después:</span> {pretty(l.newValue)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
