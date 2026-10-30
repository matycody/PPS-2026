import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gavel, Undo2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'
import { useConfirm } from '../../components/ConfirmProvider'

const fmt = (d) => (d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')

function resumen(s) {
  const parts = []
  if (s.sameDay) parts.push('resto de la jornada')
  if (s.fechas > 0) parts.push(s.fechas + (s.fechas === 1 ? ' fecha' : ' fechas'))
  return parts.length ? 'Suspendido: ' + parts.join(' + ') : 'Sin suspensión'
}

function Card({ r, onSaved }) {
  const ask = useConfirm()
  const [edit, setEdit] = useState(!r.suspension)
  const [fechas, setFechas] = useState(r.suspension?.fechas ?? 1)
  const [sameDay, setSameDay] = useState(r.suspension?.sameDay ?? false)
  const [note, setNote] = useState(r.suspension?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const m = r.match

  const save = async (f, sd) => {
    setBusy(true); setErr('')
    try {
      await api('PUT', '/sanctions/' + r.id + '/suspension', { fechas: f, sameDay: sd, note })
      setEdit(false); onSaved()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const undo = async () => {
    if (!(await ask({ title: 'Deshacer la decisión', message: 'La roja vuelve a quedar pendiente de evaluación.', confirmText: 'Deshacer' }))) return
    await api('DELETE', '/sanctions/' + r.id + '/suspension').then(onSaved).catch((e) => setErr(e.message))
  }

  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-6 w-4 shrink-0 rounded-sm bg-red-600" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-tight">{r.player?.name}{r.player?.number != null ? ' #' + r.player.number : ''}</p>
          <p className="text-xs text-muted">
            <Link to={'/partido/' + m.id} className="underline">{m.teamA ?? '?'} vs {m.teamB ?? '?'}</Link> · {m.tournament ?? 'Amistoso'} · {fmt(m.scheduledAt)}
          </p>
          {r.reason && <p className="mt-1 text-sm">“{r.reason}”</p>}
        </div>
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {!edit && r.suspension && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className="font-semibold">{resumen(r.suspension)}{r.suspension.note ? ' · ' + r.suspension.note : ''}</span>
          <div className="flex gap-1">
            <button onClick={() => setEdit(true)} className="rounded-lg px-2 py-1 text-xs font-bold text-accent">Editar</button>
            <button onClick={undo} aria-label="Deshacer" className="rounded-lg px-2 py-1 text-muted"><Undo2 size={16} /></button>
          </div>
        </div>
      )}
      {edit && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} className="h-4 w-4" />
            No juega lo que resta de la misma jornada
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Fechas siguientes sin jugar</span>
            <input type="number" min="0" max="20" value={fechas} onChange={(e) => setFechas(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className={inputCls + ' !w-24 text-center'} />
          </label>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Nota del departamento (opcional)" className={inputCls} />
          <div className="flex gap-2">
            <Btn tone="accent" disabled={busy || (fechas === 0 && !sameDay)} onClick={() => save(fechas, sameDay)} className="flex-1">Aplicar suspensión</Btn>
            <Btn disabled={busy} onClick={() => save(0, false)} className="flex-1">Sin suspensión</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SancionesPage() {
  const [tab, setTab] = useState('pending')
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')

  const load = () => api('GET', '/sanctions/reds?status=' + tab).then((r) => setList(r.items)).catch((e) => setErr(e.message))
  useEffect(() => { setList(null); load() }, [tab])

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-extrabold"><Gavel size={20} /> Departamento de sanciones</h1>
      <div className="flex gap-1 rounded-2xl bg-surface-2 p-1 text-sm font-bold">
        {[['pending', 'Pendientes'], ['decided', 'Evaluadas']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={'flex-1 rounded-xl py-2 ' + (tab === k ? 'bg-surface text-accent' : 'text-muted')}>{l}</button>
        ))}
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {list === null && !err && <p className="text-sm text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-muted">{tab === 'pending' ? 'No hay rojas pendientes de evaluación.' : 'Todavía no hay rojas evaluadas.'}</p>}
      {list?.map((r) => <Card key={r.id + (r.suspension?.id ?? '')} r={r} onSaved={load} />)}
    </div>
  )
}
