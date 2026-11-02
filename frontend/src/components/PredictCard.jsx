import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BRANCH, MODALITY } from '../lib/format'
import { dayTab, dayOf } from '../lib/days'

export const fmtCuota = (c) => (c == null ? '–' : Number(c).toFixed(2).replace('.', ','))
export const fmtMult = (x) => '×' + String(x).replace('.', ',')
const hour = (iso, timeSet) => (iso && timeSet !== false ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : null)
const abbr = (name) => String(name ?? '?').normalize('NFD').replace(/[^A-Za-z ]/g, '').trim().slice(0, 3).toUpperCase() || '?'

// Tarjeta de predicción de un partido: tres botones con la cuota (cuanto más alta, más improbable y más puntos),
// el bonus por anticipación vigente y cuánto falta para que baje.
export default function PredictCard({ m, info, onPick, showTournament = true }) {
  const [err, setErr] = useState('')
  if (!info) return null
  const opts = [
    { k: 'A', label: m.teamA?.name },
    ...(info.odds.drawAllowed ? [{ k: 'DRAW', label: 'Empate' }] : []), // en una llave no hay empate
    { k: 'B', label: m.teamB?.name },
  ]
  const when = m.scheduledAt ? [dayTab(dayOf(m.scheduledAt)), hour(m.scheduledAt, m.timeSet)].filter(Boolean).join(' · ') : 'Sin fecha'
  const meta = [showTournament ? m.tournament?.name : null, MODALITY[m.modality], BRANCH[m.branch]].filter(Boolean).join(' · ')
  const canPick = info.open && !info.blocked
  const tone = (k) => {
    if (info.pick !== k) return 'border-line bg-surface-2'
    return info.result === 'HIT' ? 'border-live bg-live/15 text-live' : info.result === 'MISS' ? 'border-danger bg-danger/10 text-danger' : 'border-accent bg-accent-soft'
  }
  const choose = async (k) => {
    if (!canPick) return
    setErr(await onPick(m.id, k))
  }
  const b = info.bonus
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <Link to={'/partido/' + m.id} className="mb-2 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-muted">
        <span className="min-w-0 truncate">{meta}</span>
        <span className="shrink-0">{when}</span>
      </Link>
      <div className={'grid gap-2 ' + (opts.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {opts.map((o) => (
          <button key={o.k} type="button" disabled={!canPick} aria-pressed={info.pick === o.k} onClick={() => choose(o.k)}
            className={'flex min-w-0 flex-col items-center gap-0.5 rounded-xl border px-1.5 py-2 disabled:opacity-70 ' + tone(o.k)}>
            <span className="w-full truncate text-center text-xs font-bold">{o.k === 'DRAW' ? 'Empate' : o.label ?? abbr(o.label)}</span>
            <span className="text-base font-extrabold tabular-nums">{fmtCuota(info.odds[o.k].cuota)}</span>
          </button>
        ))}
      </div>
      {info.blocked ? (
        <p className="mt-2 text-xs text-muted">{info.blocked}.</p>
      ) : info.pick ? (
        <p className="mt-2 text-xs text-muted">
          {info.result === 'HIT' ? <b className="text-live">Acertaste: +{info.points} pts</b> : info.result === 'MISS' ? <b className="text-danger">No acertaste</b> : <>Si acertás: <b className="text-fg">+{info.points} pts</b>{b.mine > 1 ? ' · tu bonus ' + fmtMult(b.mine) : ''}</>}
        </p>
      ) : canPick && b.mult > 1 ? (
        <p className="mt-2 text-xs text-muted">Bonus por anticipación <b className="text-fg">{fmtMult(b.mult)}</b>{b.next ? ' · baja a ' + fmtMult(b.next) + ' en ' + b.inDays + (b.inDays === 1 ? ' día' : ' días') : ''}</p>
      ) : null}
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  )
}
