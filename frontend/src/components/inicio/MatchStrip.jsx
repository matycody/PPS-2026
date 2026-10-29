import { Link } from 'react-router-dom'
import TeamBadge from '../TeamBadge'

// Tira chica y deslizable arriba del Inicio: partidos en vivo y los que terminaron hace poco
export default function MatchStrip({ matches }) {
  if (!matches.length) return null
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2">
        {matches.map((m) => {
          const live = m.status === 'LIVE'
          return (
            <Link
              key={m.id}
              to={'/partido/' + m.id}
              className={'flex w-[104px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border bg-surface px-2 py-2.5 ' + (live ? 'border-live/50' : 'border-line')}
            >
              <div className="flex items-center gap-1.5">
                <TeamBadge team={m.teamA} size="sm" />
                <TeamBadge team={m.teamB} size="sm" />
              </div>
              <span className="font-mono text-base font-extrabold tabular-nums">{m.score?.teamA ?? 0} - {m.score?.teamB ?? 0}</span>
              <span className={'text-[11px] font-bold ' + (live ? 'text-live' : 'text-muted')}>{live ? 'En vivo' : 'Resumen'}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
