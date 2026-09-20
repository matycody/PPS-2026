import { Link } from 'react-router-dom'
import StatusPill from './StatusPill'
import TeamBadge from './TeamBadge'
import { fmtWhen } from '../lib/format'

export default function MatchCard({ m, featured = false }) {
  const a = m.teamA?.name ?? 'Por definir'
  const b = m.teamB?.name ?? 'Por definir'
  const showScore = m.status === 'LIVE' || m.status === 'FINISHED'
  const sa = m.score?.teamA ?? 0
  const sb = m.score?.teamB ?? 0

  if (featured) {
    return (
      <Link to={'/partido/' + m.id} className="block rounded-3xl border border-accent/40 bg-surface p-5">
        <div className="flex items-center justify-between">
          <StatusPill status={m.status} />
          <span className="text-sm text-muted">Cancha {m.court}</span>
        </div>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamBadge team={m.teamA} size="lg" />
            <span className="text-sm font-bold">{a}</span>
          </div>
          <span className="font-mono text-4xl font-extrabold tabular-nums">{sa} - {sb}</span>
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamBadge team={m.teamB} size="lg" />
            <span className="text-sm font-bold">{b}</span>
          </div>
        </div>
        <div className="mt-5 rounded-2xl bg-accent py-3 text-center font-extrabold text-black">Ver en vivo</div>
      </Link>
    )
  }

  return (
    <Link to={'/partido/' + m.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{a} <span className="font-normal text-muted">vs</span> {b}</p>
        <p className="mt-0.5 truncate text-sm text-muted">{fmtWhen(m.scheduledAt)} · Cancha {m.court}</p>
      </div>
      {showScore && <span className="font-mono text-lg font-extrabold tabular-nums">{sa}-{sb}</span>}
      <StatusPill status={m.status} />
    </Link>
  )
}
