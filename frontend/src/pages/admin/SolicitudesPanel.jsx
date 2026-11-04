import { useEffect, useState } from 'react'
import { Mail, IdCard, Shirt, Check, X, TriangleAlert } from 'lucide-react'
import { api } from '../../lib/api'
import { Alert } from '../../components/ui'
import { useConfirm } from '../../components/ConfirmProvider'

const BRANCH = { MIXED: 'Mixto', MALE: 'Masculino', FEMALE: 'Femenino' }
const STATUS = { PENDING: 'Pendientes', APPROVED: 'Aprobadas', REJECTED: 'Rechazadas' }

const ST_STYLE = {
  PENDING: { label: 'Pendiente', cls: 'bg-warn/15 text-warn' },
  APPROVED: { label: 'Aprobada', cls: 'bg-live/15 text-live' },
  REJECTED: { label: 'Rechazada', cls: 'bg-danger/15 text-danger' },
}

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
      {list === null && <div className="text-muted">Cargando…</div>}
      {list?.length === 0 && <div className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">No hay solicitudes {STATUS[status].toLowerCase()}.</div>}
      {(list ?? []).map((r) => {
        const blocked = (r.conflicts ?? []).some((c) => c.blocking)
        const st = ST_STYLE[r.status]
        return (
          <div key={r.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/15 text-lg font-extrabold uppercase text-accent">{(r.name ?? '?').trim().charAt(0)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-extrabold leading-tight">{r.name}</p>
                  <span className={'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ' + st.cls}>{st.label}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted"><Mail size={13} className="shrink-0" /><span className="truncate">{r.user?.email}</span></div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs font-bold">
              <span className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1"><IdCard size={13} /> DNI {r.dni}</span>
              <span className="rounded-full border border-line px-2.5 py-1">{r.sex === 'M' ? 'Masculino' : 'Femenino'}</span>
              {r.number != null && <span className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1"><Shirt size={13} /> N° {r.number}</span>}
            </div>
            {r.teams.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">Equipos</div>
                <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                  {r.teams.map((t, i) => (
                    <span key={i} className="rounded-lg bg-surface-2 px-2.5 py-1">{(t.name ?? '?')} <span className="font-normal text-muted">· {BRANCH[t.branch]}</span></span>
                  ))}
                </div>
              </div>
            )}
            {(r.conflicts ?? []).map((c) => (
              <div key={c.code} className={'flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-bold ' + (c.blocking ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn')}>
                <TriangleAlert size={14} className="mt-0.5 shrink-0" /><span>{c.message}</span>
              </div>
            ))}
            {r.status === 'REJECTED' && <div className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger"><b>Motivo:</b> {r.rejectReason}</div>}
            {r.status === 'PENDING' && (
              <div className="grid grid-cols-2 gap-2 pt-1 text-sm font-extrabold">
                <button disabled={busy} onClick={() => reject(r)} className="flex items-center justify-center gap-1.5 rounded-xl border border-danger py-2.5 text-danger disabled:opacity-40"><X size={16} /> Rechazar</button>
                <button disabled={busy || blocked} onClick={() => approve(r)} className="flex items-center justify-center gap-1.5 rounded-xl bg-live py-2.5 text-black disabled:opacity-40"><Check size={16} /> Aprobar</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
