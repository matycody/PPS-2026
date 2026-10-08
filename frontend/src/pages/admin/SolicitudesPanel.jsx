import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Alert } from '../../components/ui'
import { useConfirm } from '../../components/ConfirmProvider'

const BRANCH = { MIXED: 'Mixto', MALE: 'Masculino', FEMALE: 'Femenino' }
const STATUS = { PENDING: 'Pendientes', APPROVED: 'Aprobadas', REJECTED: 'Rechazadas' }

// Cola de solicitudes de alta de jugadores: se cotejan con la planilla y se aprueban o rechazan
export default function SolicitudesPanel({ onChange }) {
  const ask = useConfirm()
  const [status, setStatus] = useState('PENDING')
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api('GET', '/player-requests?status=' + status).then(setList).catch((e) => setErr(e.message))
  useEffect(() => { setList(null); load() }, [status])

  async function act(fn) {
    setBusy(true); setErr('')
    try { await fn(); await load(); onChange?.() } catch (e) { setErr(e.message); load() } finally { setBusy(false) }
  }

  const approve = async (r) => {
    if (!(await ask({ title: 'Aprobar solicitud', message: '¿Aprobar a ' + r.name + ' (DNI ' + r.dni + ')?', confirmText: 'Aprobar' }))) return
    act(() => api('POST', '/player-requests/' + r.id + '/approve'))
  }
  const reject = async (r) => {
    const reason = await ask({ title: 'Rechazar solicitud', message: 'Indicá el motivo (lo ve el usuario).', confirmText: 'Rechazar', danger: true, input: { type: 'text', placeholder: 'Motivo' } })
    if (!reason || !reason.trim()) return
    act(() => api('POST', '/player-requests/' + r.id + '/reject', { reason: reason.trim() }))
  }

  return (
    <div className="space-y-3">
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      <div className="flex gap-2 text-sm font-bold">
        {Object.entries(STATUS).map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)} className={'rounded-full border px-3 py-1.5 ' + (status === k ? 'border-accent text-accent' : 'border-line text-muted')}>{l}</button>
        ))}
      </div>
      {list === null && <p className="text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="text-muted">No hay solicitudes.</p>}
      {(list ?? []).map((r) => {
        const blocked = (r.conflicts ?? []).some((c) => c.blocking)
        return (
          <div key={r.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
            <div>
              <p className="font-bold">{r.name}</p>
              <p className="text-sm text-muted">DNI {r.dni} · {r.sex === 'M' ? 'Masculino' : 'Femenino'}{r.number != null ? ' · N° ' + r.number : ''}</p>
              <p className="truncate text-sm text-muted">{r.user?.email}</p>
            </div>
            <p className="text-sm">{r.teams.map((t) => (t.name ?? '?') + ' (' + BRANCH[t.branch] + ')').join(' · ')}</p>
            {(r.conflicts ?? []).map((c) => (
              <p key={c.code} className={'rounded-xl px-3 py-2 text-xs font-bold ' + (c.blocking ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn')}>{c.message}</p>
            ))}
            {r.status === 'REJECTED' && <p className="text-sm text-muted">Motivo: {r.rejectReason}</p>}
            {r.status === 'PENDING' && (
              <div className="flex gap-4 pt-1 text-sm font-bold">
                <button disabled={busy || blocked} className="text-live disabled:opacity-40" onClick={() => approve(r)}>Aprobar</button>
                <button disabled={busy} className="text-danger" onClick={() => reject(r)}>Rechazar</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
