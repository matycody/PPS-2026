import { Link } from 'react-router-dom'
import StatusPill from './StatusPill'
import Versus from './Versus'
import { fmtWhen } from '../lib/format'

const CTA = { LIVE: 'Ver en vivo', READY: 'Ver partido', SCHEDULED: 'Ver partido', FINISHED: 'Ver resultado' }

export default function MatchCard({ m, featured = false, to, badge }) {
  const showScore = m.status === 'LIVE' || m.status === 'FINISHED'
  const center = showScore ? (
    <span className="font-mono text-3xl font-extrabold tabular-nums">
      {m.score?.teamA ?? 0} - {m.score?.teamB ?? 0}
    </span>
  ) : undefined

  return (
    <Link
      to={to ?? '/partido/' + m.id}
      className={'block rounded-3xl border bg-surface p-5 ' + (featured ? 'border-accent/40' : 'border-line')}
    >
      <div className="flex items-center justify-between">
        <StatusPill status={m.status} />
        <span className="text-sm text-muted">Cancha {m.court}</span>
      </div>
      {badge && <p className="mt-2 text-center text-xs font-bold uppercase tracking-widest text-warn">{badge}</p>}
      <div className="mt-4">
        <Versus a={m.teamA} b={m.teamB} size={featured ? 'xl' : 'lg'} center={center} />
      </div>
      <p className="mt-3 text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>
      {featured && (
        <div className="mt-4 rounded-2xl bg-accent py-3 text-center font-extrabold text-black">
          {CTA[m.status] ?? 'Ver partido'}
        </div>
      )}
    </Link>
  )
}
