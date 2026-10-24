import { Link } from 'react-router-dom'
import { matchInfo } from '../lib/matchInfo'

// Resultado de un partido terminado visto desde un equipo (o varios, en el banner del jugador): G / E / P + marcador
export function outcome(m, teamIds) {
  const mineIsA = teamIds.includes(m.teamA?.id) || !teamIds.includes(m.teamB?.id)
  const mine = (mineIsA ? m.score?.teamA : m.score?.teamB) ?? 0
  const other = (mineIsA ? m.score?.teamB : m.score?.teamA) ?? 0
  return { mine, other, rival: mineIsA ? m.teamB : m.teamA, res: mine > other ? 'G' : mine < other ? 'P' : 'E' }
}

const CLS = { G: 'bg-live/15 text-live', P: 'bg-danger/15 text-danger', E: 'bg-surface-2 text-muted' }
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'Sin fecha')

export default function ResultRow({ m, teamIds }) {
  const o = outcome(m, teamIds)
  return (
    <Link to={'/partido/' + m.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <span className={'grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ' + CLS[o.res]}>{o.res}</span>
      <div className="min-w-0 flex-1">
        {m.phase?.label && (
          <p className="truncate text-[11px] font-bold uppercase tracking-wider text-accent">
            {m.phase.kind === 'LEAGUE' && m.phase.zone ? m.phase.zone + ' · ' : ''}{m.phase.label}
          </p>
        )}
        <p className="truncate font-bold">vs {o.rival?.name ?? 'Por definir'}</p>
        <p className="truncate text-xs text-muted">{matchInfo(m)} · {day(m.scheduledAt)}</p>
      </div>
      <span className="font-mono text-lg font-extrabold tabular-nums">{o.mine} - {o.other}</span>
    </Link>
  )
}
