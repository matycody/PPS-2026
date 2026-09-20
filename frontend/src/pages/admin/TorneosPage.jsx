import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'

const EMPTY = { name: '', startsAt: '', endsAt: '' }
// Mediodía UTC para que la fecha no se corra por zona horaria
const toIso = (d) => (d ? d + 'T12:00:00.000Z' : undefined)
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—')

export default function TorneosPage() {
  const [list, setList] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api('GET', '/tournaments').then(setList).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const body = { name: form.name.trim(), startsAt: toIso(form.startsAt), endsAt: toIso(form.endsAt) }
      if (editId) await api('PATCH', '/tournaments/' + editId, body)
      else await api('POST', '/tournaments', body)
      setForm(EMPTY); setEditId(null)
      await load()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  async function remove(t) {
    if (!confirm('¿Eliminar "' + t.name + '"?')) return
    setErr('')
    try { await api('DELETE', '/tournaments/' + t.id); await load() } catch (e) { setErr(e.message) }
  }

  function edit(t) {
    setEditId(t.id)
    setForm({ name: t.name, startsAt: t.startsAt?.slice(0, 10) ?? '', endsAt: t.endsAt?.slice(0, 10) ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Torneos</h1>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}

      <form onSubmit={save} className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">{editId ? 'Editar torneo' : 'Nuevo torneo'}</p>
        <input className={inputCls} placeholder="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted">Inicio
            <input type="date" className={inputCls} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </label>
          <label className="text-xs text-muted">Fin
            <input type="date" className={inputCls} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </label>
        </div>
        <div className="flex gap-2">
          <Btn type="submit" tone="accent" disabled={busy} className="flex-1">{editId ? 'Guardar' : 'Crear'}</Btn>
          {editId && <Btn onClick={() => { setEditId(null); setForm(EMPTY) }}>Cancelar</Btn>}
        </div>
      </form>

      {list === null && <p className="text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="text-muted">Todavía no hay torneos.</p>}
      <div className="space-y-2">
        {(list ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{t.name}</p>
              <p className="text-sm text-muted">{fmt(t.startsAt)} → {fmt(t.endsAt)}</p>
            </div>
            <button aria-label="Editar" onClick={() => edit(t)}><Pencil size={18} className="text-muted" /></button>
            <button aria-label="Eliminar" onClick={() => remove(t)}><Trash2 size={18} className="text-danger" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
