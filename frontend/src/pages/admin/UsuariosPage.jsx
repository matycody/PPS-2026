import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'

const ROLE = { ADMIN: 'Organizador', REFEREE: 'Árbitro', PLAYER: 'Jugador' }

export default function UsuariosPage() {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [inactive, setInactive] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    const p = new URLSearchParams({ active: inactive ? 'false' : 'true' })
    if (q.trim()) p.set('q', q.trim())
    if (role) p.set('role', role)
    return api('GET', '/users?' + p).then(setList).catch((e) => setErr(e.message))
  }
  useEffect(() => { load() }, [role, inactive])

  async function act(method, path) {
    setBusy(true); setErr('')
    try { await api(method, path); await load() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Usuarios y roles</h1>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}

      <form onSubmit={(e) => { e.preventDefault(); load() }} className="flex gap-2">
        <input className={inputCls} placeholder="Buscar por mail" value={q} onChange={(e) => setQ(e.target.value)} />
        <Btn type="submit"><Search size={18} /></Btn>
      </form>
      <div className="flex items-center gap-4">
        <select className={inputCls + ' max-w-44'} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Todos los roles</option>
          {Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Inactivos</label>
      </div>

      {list === null && <p className="text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="text-muted">No hay usuarios.</p>}
      <div className="space-y-2">
        {(list ?? []).map((u) => {
          const isAdmin = u.roles.includes('ADMIN')
          return (
            <div key={u.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <p className="truncate font-bold">{u.email}</p>
              <div className="flex flex-wrap gap-1.5">
                {u.roles.length === 0 && <span className="text-xs text-muted">Registrado (sin rol)</span>}
                {u.roles.map((r) => (
                  <span key={r} className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase text-accent">{ROLE[r] ?? r}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 pt-1 text-sm font-bold">
                {u.active && !isAdmin && <button disabled={busy} className="text-accent" onClick={() => confirm('¿Hacer admin a ' + u.email + '?') && act('POST', '/users/' + u.id + '/promote')}>Hacer admin</button>}
                {u.active && isAdmin && <button disabled={busy} className="text-warn" onClick={() => confirm('¿Quitar admin a ' + u.email + '?') && act('POST', '/users/' + u.id + '/demote')}>Quitar admin</button>}
                {u.active
                  ? <button disabled={busy} className="text-danger" onClick={() => confirm('¿Desactivar a ' + u.email + '?') && act('DELETE', '/users/' + u.id)}>Desactivar</button>
                  : <button disabled={busy} className="text-live" onClick={() => act('POST', '/users/' + u.id + '/reactivate')}>Reactivar</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
