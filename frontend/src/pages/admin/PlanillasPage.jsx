import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Alert, inputCls } from '../../components/ui'
import { fmtWhen } from '../../lib/format'

const STATUS = {
  CONFIRMED: ['Confirmada', 'text-live'],
  PENDING: ['Sin confirmar', 'text-warn'],
  SUPERSEDED: ['Reemplazada', 'text-muted'],
  REJECTED: ['Anulada', 'text-danger'],
}
const FILTERS = [['', 'Todas'], ['CONFIRMED', 'Confirmadas'], ['PENDING', 'Sin confirmar'], ['REJECTED', 'Anuladas']]
const when = (d) => (d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

function Badge({ status }) {
  const [label, cls] = STATUS[status] ?? [status, 'text-muted']
  return <span className={'rounded-full border border-line px-2 py-0.5 text-[11px] font-bold ' + cls}>{label}</span>
}

// Organización: todas las planillas de juego cargadas, partido por partido, con su foto original
export default function PlanillasPage() {
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [st, setSt] = useState('')
  const [open, setOpen] = useState(null) // matchId
  const [detail, setDetail] = useState(null)

  useEffect(() => { api('GET', '/sheets').then(setItems).catch((e) => setErr(e.message)) }, [])
  useEffect(() => {
    setDetail(null)
    if (!open) return
    api('GET', '/sheets/' + open).then(setDetail).catch((e) => setErr(e.message))
  }, [open])

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (items ?? []).filter((i) => (!st || i.status === st)
      && (!t || [i.match.teamA?.name, i.match.teamB?.name, i.match.tournament?.name, i.uploadedBy].filter(Boolean).join(' ').toLowerCase().includes(t)))
  }, [items, q, st])

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Planillas de juego</h1>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por equipo, torneo o quién la cargó…" />
      <div className="flex flex-wrap gap-2 text-sm font-bold">
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => setSt(id)} className={'rounded-full border px-4 py-1.5 ' + (st === id ? 'border-accent text-accent' : 'border-line text-muted')}>{label}</button>
        ))}
      </div>

      {items === null && !err && <p className="text-muted">Cargando…</p>}
      {items && list.length === 0 && <p className="text-muted">{items.length ? 'Ninguna planilla coincide con el filtro.' : 'Todavía no se cargó ninguna planilla.'}</p>}

      <div className="space-y-2">
        {list.map((i) => (
          <button key={i.match.id} onClick={() => setOpen(i.match.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left">
            <img src={i.thumbUrl} alt="" loading="lazy" className="h-16 w-12 shrink-0 rounded-lg border border-line bg-surface-2 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">{(i.match.teamA?.name ?? '—') + ' vs ' + (i.match.teamB?.name ?? '—')}</p>
              <p className="truncate text-xs text-muted">{(i.match.tournament?.name ?? 'Partido suelto') + ' · ' + fmtWhen(i.match.scheduledAt, i.match.timeSet)}</p>
              <p className="mt-1 text-xs text-muted">{i.status === 'CONFIRMED' ? i.present + ' juegan · ' + i.absent + ' no · ' : ''}cargó {i.uploadedBy ?? '—'} · {when(i.uploadedAt)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge status={i.status} />
              {i.versions > 1 && <span className="text-[11px] text-muted">{i.versions} versiones</span>}
            </div>
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setOpen(null)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-line bg-bg p-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start gap-3">
              <ClipboardCheck size={18} className="mt-0.5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">{detail ? (detail.match.teamA?.name ?? '—') + ' vs ' + (detail.match.teamB?.name ?? '—') : 'Cargando…'}</p>
                {detail && <p className="text-xs text-muted">{(detail.match.tournament?.name ?? 'Partido suelto') + ' · ' + fmtWhen(detail.match.scheduledAt, detail.match.timeSet)}</p>}
              </div>
              <button onClick={() => setOpen(null)} aria-label="Cerrar" className="text-muted"><X size={20} /></button>
            </div>

            {detail && (
              <div className="space-y-4">
                {detail.players.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {[detail.match.teamA, detail.match.teamB].map((t) => (
                      <div key={t?.id} className="rounded-2xl border border-line bg-surface p-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">{t?.name}</p>
                        {detail.players.filter((p) => p.teamId === t?.id).map((p, k) => (
                          <p key={k} className={'text-sm ' + (p.present ? '' : 'text-muted line-through opacity-60')}>
                            <span className="mr-2 text-xs text-muted">{p.number != null ? '#' + p.number : ''}</span>{p.name}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs font-bold uppercase tracking-widest text-muted">Versiones de la planilla ({detail.sheets.length})</p>
                {detail.sheets.map((s) => (
                  <div key={s.id} className="space-y-2 rounded-2xl border border-line bg-surface p-3">
                    <div className="flex items-center justify-between gap-2"><Badge status={s.status} /><span className="text-xs text-muted">{when(s.uploadedAt)}</span></div>
                    <a href={s.imageUrl} target="_blank" rel="noreferrer"><img src={s.imageUrl} alt="Foto original de la planilla" className="w-full rounded-xl border border-line" /></a>
                    <p className="text-xs text-muted">
                      Cargó {s.uploadedBy ?? '—'}{s.confirmedAt ? ' · confirmó ' + (s.confirmedBy ?? '—') + ' (' + when(s.confirmedAt) + ')' : ''}
                      {s.aiError ? ' · la lectura automática falló, se marcó a mano' : s.aiModel ? ' · leída con ' + s.aiModel : ''}
                    </p>
                    <p className="break-all text-[10px] text-muted">Huella SHA-256: {s.sha256} · {(s.bytes / 1024 / 1024).toFixed(1)} MB</p>
                    <a href={s.imageUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-accent">Abrir foto original ›</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
