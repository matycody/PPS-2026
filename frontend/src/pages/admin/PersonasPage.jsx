import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'

const EMPTY = { dni: '', name: '', email: '', sex: '', isPlayer: true, isReferee: false }
const Chip = ({ children, cls = 'bg-surface-2 text-muted' }) => (
  <span className={'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ' + cls}>{children}</span>
)

export default function PersonasPage() {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [pending, setPending] = useState(false)
  const [inactive, setInactive] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null) // perfil en edición
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    const p = new URLSearchParams({ active: inactive ? 'false' : 'true' })
    if (q.trim()) p.set('q', q.trim())
    if (pending) p.set('status', 'PENDIENTE_VINCULACION')
    return api('GET', '/profiles?' + p).then(setList).catch((e) => setErr(e.message))
  }
  useEffect(() => { load() }, [pending, inactive])

  async function run(fn, msg) {
    setBusy(true); setErr(''); setOk('')
    try { await fn(); await load(); if (msg) setOk(msg) } catch (e) { setErr(e.data?.errors?.join(' · ') || e.message) } finally { setBusy(false) }
  }

  function startEdit(p) {
    setEditing(p)
    setForm({ dni: p.dni, name: p.name, email: p.email, sex: p.sex ?? '', isPlayer: p.isPlayer, isReferee: p.isReferee })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const reset = () => { setEditing(null); setForm(EMPTY) }

  function submit(e) {
    e.preventDefault()
    const body = { dni: form.dni.trim(), name: form.name.trim(), isPlayer: form.isPlayer, isReferee: form.isReferee }
    if (form.sex) body.sex = form.sex
    if (!editing) body.email = form.email.trim()
    // El mail solo se cambia mientras esté pendiente de vinculación
    if (editing && editing.status === 'PENDIENTE_VINCULACION') body.email = form.email.trim()
    run(async () => {
      if (editing) await api('PATCH', '/profiles/' + editing.id, body)
      else await api('POST', '/profiles', body)
      reset()
    }, editing ? 'Persona actualizada' : 'Persona inscripta')
  }

  const emailLocked = editing && editing.status !== 'PENDIENTE_VINCULACION'

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Personas</h1>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

      <form onSubmit={submit} className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">{editing ? 'Editar persona' : 'Inscribir jugador o árbitro'}</p>
        <input className={inputCls} placeholder="Nombre completo" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} placeholder="DNI" required value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} />
          <select className={inputCls} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
            <option value="">Sexo…</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </div>
        <input className={inputCls} type="email" placeholder="Mail" required disabled={emailLocked} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        {emailLocked && <p className="text-xs text-muted">El mail solo se cambia mientras esté pendiente de vinculación. Usá "Desvincular".</p>}
        <div className="flex gap-4 text-sm font-semibold">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isPlayer} onChange={(e) => setForm({ ...form, isPlayer: e.target.checked })} /> Jugador</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isReferee} onChange={(e) => setForm({ ...form, isReferee: e.target.checked })} /> Árbitro</label>
        </div>
        {form.isPlayer && !form.sex && <p className="text-xs text-warn">El sexo es obligatorio para jugadores.</p>}
        <div className="flex gap-2">
          <Btn type="submit" tone="accent" disabled={busy || (!form.isPlayer && !form.isReferee) || (form.isPlayer && !form.sex)} className="flex-1">
            {editing ? 'Guardar' : 'Inscribir'}
          </Btn>
          {editing && <Btn onClick={reset}>Cancelar</Btn>}
        </div>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); load() }} className="flex gap-2">
        <input className={inputCls} placeholder="Buscar nombre, DNI o mail" value={q} onChange={(e) => setQ(e.target.value)} />
        <Btn type="submit"><Search size={18} /></Btn>
      </form>
      <div className="flex gap-4 text-sm font-semibold">
        <label className="flex items-center gap-2"><input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} /> Pendientes de vinculación</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Inactivos</label>
      </div>

      {list === null && <p className="text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="text-muted">No hay personas.</p>}
      <div className="space-y-2">
        {(list ?? []).map((p) => (
          <div key={p.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold">{p.name}</p>
                <p className="truncate text-xs text-muted">{p.dni} · {p.email}</p>
              </div>
              <Chip cls={p.status === 'VINCULADO' ? 'bg-live/15 text-live' : 'bg-warn/15 text-warn'}>
                {p.status === 'VINCULADO' ? 'Vinculado' : 'Pendiente'}
              </Chip>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.isPlayer && <Chip cls="bg-accent-soft text-accent">Jugador</Chip>}
              {p.isReferee && <Chip cls="bg-accent-soft text-accent">Árbitro</Chip>}
              {(p.teams ?? []).map((t) => <Chip key={t.teamId + t.branch}>{t.name}</Chip>)}
            </div>
            <div className="flex flex-wrap gap-2 pt-1 text-sm font-bold">
              <button className="text-accent" onClick={() => startEdit(p)}>Editar</button>
              {p.status === 'VINCULADO' && (
                <button className="text-warn" onClick={() => {
                  const email = prompt('Mail nuevo para ' + p.name + ':')
                  if (email) run(() => api('POST', '/profiles/' + p.id + '/unlink', { email: email.trim() }), 'Cuenta desvinculada')
                }}>Desvincular</button>
              )}
              {p.active
                ? <button className="text-danger" onClick={() => confirm('¿Dar de baja a ' + p.name + '?') && run(() => api('DELETE', '/profiles/' + p.id), 'Baja realizada')}>Dar de baja</button>
                : <button className="text-live" onClick={() => run(() => api('PATCH', '/profiles/' + p.id, { active: true }), 'Reactivado (volvé a asignarle equipo)')}>Reactivar</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
