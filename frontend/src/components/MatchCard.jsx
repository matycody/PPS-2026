import { Link } from 'react-router-dom'
import StatusPill from './StatusPill'
import Versus from './Versus'
import { fmtWhen, BRANCH, MODALITY } from '../lib/format'
import { useLiveTick } from '../lib/liveTicks'
import { statusBorder } from '../lib/statusStyle'

// "1:48" -> "01:48"
const clock = (t) => (t ? t.replace(/^(\d):/, '0$1:') : '--:--')

const CTA = { LIVE: 'Ver en vivo', READY: 'Ver partido', SCHEDULED: 'Ver partido', FINISHED: 'Ver resultado' }

export default function MatchCard({ m, featured = false, to, badge }) {
  const tick = useLiveTick(m.id, m.status === 'LIVE')
  const showScore = m.status === 'LIVE' || m.status === 'FINISHED'
  const center = showScore ? (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-3xl font-extrabold tabular-nums">{m.score?.teamA ?? 0} - {m.score?.teamB ?? 0}</span>
      {m.status === 'LIVE' && <span className="font-mono text-lg font-extrabold tabular-nums text-live">{clock(tick?.matchTime)}</span>}
    </div>
  ) : undefined

  return (
    <Link
      to={to ?? '/partido/' + m.id}
      className={'block rounded-3xl border bg-surface p-5 ' + statusBorder(m.status, featured ? 'border-live/40' : 'border-line')}
    >
      <div className="flex items-center justify-between">
        <StatusPill status={m.status} />
        <span className="text-sm text-muted">Cancha {m.court}</span>
      </div>
      {badge && <p className="mt-2 text-center text-xs font-bold uppercase tracking-widest text-warn">{badge}</p>}
      <div className="mt-4">
        <Versus a={m.teamA} b={m.teamB} size={featured ? 'xl' : 'lg'} center={center} />
      </div>
      {['LIVE', 'READY', 'SCHEDULED'].includes(m.status) && (
        <p className="mt-3 text-center text-xs font-bold uppercase tracking-wider text-muted">
          {[m.tournament?.name ?? m.tournamentName, MODALITY[m.modality], BRANCH[m.branch]].filter(Boolean).join(' \u00b7 ')}
        </p>
      )}
      <p className="mt-3 text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>
      {featured && (
        <div className="mt-4 rounded-2xl bg-live py-3 text-center font-extrabold text-black">
          {CTA[m.status] ?? 'Ver partido'}
        </div>
      )}
    </Link>
  )
}
