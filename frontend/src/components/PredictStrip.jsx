import { useState } from 'react'
import { fmtCuota, fmtMult } from './PredictCard'

// Tres letras del equipo para el botón (Old Blue -> OLD)
const abbr = (name) => String(name ?? '?').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || '?'
// Prode dentro de la fila de un partido: LOCAL cuota | X cuota | VISITANTE cuota. La cuota sale de los resultados anteriores: cuanto más alta, más puntos.
// No se muestra si el usuario no puede predecir ese partido (juega en él o está asignado) ni si ya empezó y nadie votó.
export default function PredictStrip({ m, info, onPick }) {
  const [err, setErr] = useState('')
  if (!info || info.blocked) return null
  if (!info.open && !info.pick && !info.votes.total) return null

  const opts = [
    { k: 'A', label: abbr(m.teamA?.name) },
    ...(info.odds.drawAllowed ? [{ k: 'DRAW', label: 'X' }] : []), // en una llave no hay empate
    { k: 'B', label: abbr(m.teamB?.name) },
  ]
  const tone = (k) => {
    if (info.pick !== k) return 'border-line bg-surface-2'
    return info.result === 'HIT' ? 'border-live bg-live/15 text-live' : info.result === 'MISS' ? 'border-danger bg-danger/10 text-danger' : 'border-accent bg-surface-2 ring-1 ring-accent'
  }
  const choose = async (k) => {
    if (!info.open) return
    setErr(await onPick(m.id, k))
  }
  return (
    <div className="px-3 pb-3">
      <div className={'grid gap-2 ' + (opts.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {opts.map((o) => (
          <button key={o.k} type="button" disabled={!info.open} aria-pressed={info.pick === o.k} onClick={() => choose(o.k)}
            className={'flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-extrabold disabled:opacity-70 ' + tone(o.k)}>
            <span>{o.label}</span>
            <span className="tabular-nums">{fmtCuota(info.odds[o.k].cuota)}</span>
          </button>
        ))}
      </div>
      {info.open && info.pick && <p className="mt-2 text-xs text-muted">Si acertás: <b className="text-fg">+{info.points} pts</b>{info.bonus.mine > 1 ? ' · bonus ' + fmtMult(info.bonus.mine) : ''}</p>}
      {info.open && !info.pick && info.bonus.mult > 1 && <p className="mt-2 text-xs text-muted">Bonus por anticipación <b className="text-fg">{fmtMult(info.bonus.mult)}</b></p>}
      {info.result === 'HIT' && <p className="mt-2 text-xs font-bold text-live">Acertaste: +{info.points} pts</p>}
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  )
}
