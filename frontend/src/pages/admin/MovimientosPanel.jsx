import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { inputCls } from '../../components/ui'

const when = (iso) => new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })
const dot = (m) => (m === 'DELETE' ? 'bg-danger' : m === 'POST' ? 'bg-live' : 'bg-accent')

// Movimientos de usuarios y administradores (GET /audit)
export default function MovimientosPanel() {
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')

  const load = (before) => {
    const p = new URLSearchParams({ limit: '100' })
    if (q.trim()) p.set('q', q.trim())
    if (before) p.set('before', before)
    return api('GET', '/audit?' + p)
      .then((r) => { setMore(r.length === 100); setList((cur) => (before ? [...(cur ?? []), ...r] : r)) })
      .catch((e) => setErr(e.message))
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-3">
      {err && <p className="text-danger">{err}</p>}
      <form onSubmit={(e) => { e.preventDefault(); setList(null); load() }}>
        <input className={inputCls} placeholder="Buscar por mail o acción" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      {list === null && <p className="text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="text-muted">Sin movimientos.</p>}
      <div className="space-y-2">
        {(list ?? []).map((l) => (
          <div key={l.id} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
            <span className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + dot(l.method)} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{l.label}</p>
              <p className="mt-1 truncate text-xs text-muted">{l.actorEmail ?? '—'} · {when(l.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
      {more && <button className="w-full py-2 text-sm font-bold text-accent" onClick={() => load(list[list.length - 1].createdAt)}>Ver más</button>}
    </div>
  )
}
