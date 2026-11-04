import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { fmtCuota, fmtMult } from './PredictCard'

// Predicciones del partido: elegís quién gana (o empate) hasta que empiece. Sin dinero: cada acierto suma puntos al ranking.
// No aparece sin sesión ni para quien juega o está asignado a este partido (el backend lo informa en "blocked").
export default function PredictBox({ matchId, teamA, teamB }) {
  const user = useAuthStore((s) => s.user)
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!user || !matchId) return
    let live = true
    api('GET', '/predictions/match/' + matchId).then((r) => live && setD(r)).catch(() => live && setD(null))
    return () => { live = false }
  }, [user, matchId])

  if (!user || !d) return null
  if (!d.open && !d.pick && !d.votes.total && !d.blocked) return null // ya empezó y nadie había predicho

  const choose = async (pick) => {
    if (!d.open || busy) return
    setBusy(true)
    setErr('')
    try {
      if (d.pick === pick) await api('DELETE', '/predictions/match/' + matchId)
      else await api('POST', '/predictions', { matchId, pick })
      setD(await api('GET', '/predictions/match/' + matchId))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const opts = [
    { k: 'A', label: teamA?.name ?? 'Local' },
    ...(d.odds.drawAllowed ? [{ k: 'DRAW', label: 'Empate' }] : []), // en una llave no hay empate
    { k: 'B', label: teamB?.name ?? 'Visitante' },
  ]
  const verdict = d.result === 'HIT' ? 'Acertaste: +' + d.points + ' pts' : d.result === 'MISS' ? 'No acertaste' : d.result === 'VOID' ? 'Partido sin resultado: no suma ni resta' : null

  return (
    <div className="rounded-3xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted"><Trophy size={14} /> Predicciones</p>
        <Link to="/predicciones" className="text-xs font-bold text-accent">Mis puntos y ranking</Link>
      </div>

      <>
        {<div className={'grid gap-2 ' + (opts.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {opts.map((o) => {
            const on = d.pick === o.k
            return (
              <button
                key={o.k}
                type="button"
                disabled={!d.open || busy || !!d.blocked}
                onClick={() => choose(o.k)}
                aria-pressed={on}
                className={'flex min-w-0 flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center disabled:opacity-60 ' + (on ? 'border-accent bg-surface-2 ring-1 ring-accent' : 'border-line bg-surface-2')}
              >
                <span className="w-full truncate text-xs font-extrabold">{o.label}</span>
                <span className="text-sm font-extrabold tabular-nums">{fmtCuota(d.odds[o.k].cuota)}</span>
                {!d.blocked && <span className="text-[11px] font-bold text-muted">+{d.odds[o.k].pts} pts</span>}
              </button>
            )
          })}
        </div>}
        {d.blocked && <p className="mt-3 text-sm text-muted">{d.blocked}.{d.open ? '' : ' Las predicciones de este partido ya cerraron: estas son las cuotas con las que cerraron.'}</p>}
        {!d.blocked && d.open && !d.pick && d.bonus.mult > 1 && <p className="mt-3 text-xs text-muted">Bonus por anticipación <b className="text-fg">{fmtMult(d.bonus.mult)}</b>{d.bonus.next ? ' · baja a ' + fmtMult(d.bonus.next) + ' en ' + d.bonus.inDays + (d.bonus.inDays === 1 ? ' día' : ' días') : ''}</p>}
        {!d.blocked && d.open && d.pick && d.bonus.mine > 1 && <p className="mt-3 text-xs text-muted">Tu bonus por anticipación: <b className="text-fg">{fmtMult(d.bonus.mine)}</b></p>}
        {!d.open && !d.pick && !d.blocked && <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">Predicciones cerradas</p>}
        {verdict && <p className={'mt-3 text-sm font-bold ' + (d.result === 'HIT' ? 'text-live' : 'text-muted')}>{verdict}</p>}
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <p className="mt-3 text-[11px] text-muted">{d.votes.total} {d.votes.total === 1 ? 'voto' : 'votos'}</p>
      </>
    </div>
  )
}
