import { Link } from 'react-router-dom'
import GoTo from './GoTo'
import StatusPill from './StatusPill'
import MatchNotice from './MatchNotice'
import Versus from './Versus'
import { fmtWhen, BRANCH, MODALITY, courtLabel } from '../lib/format'
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
      {m.status === 'LIVE' && tick?.matchHalf && (
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{Number(tick.matchHalf) === 2 ? '2do tiempo' : '1er tiempo'}</span>
      )}
    </div>
  ) : undefined

  return (
    <Link
      to={to ?? '/partido/' + m.id}
      className={'block rounded-3xl border bg-surface p-5 ' + statusBorder(m.status, featured ? 'border-live/40' : 'border-line')}
    >
      <div className="flex items-center justify-between">
        <StatusPill status={m.status} />
        <span className="text-sm text-muted">{courtLabel(m.court)}</span>
      </div>
      {m.phase?.label && (
        <p className="mt-2 text-center text-xs font-bold uppercase tracking-widest text-accent">
          {m.phase.kind === 'LEAGUE' && m.phase.zone ? m.phase.zone + ' · ' : ''}{m.phase.label}
        </p>
      )}
      {badge && <p className="mt-2 text-center text-xs font-bold uppercase tracking-widest text-warn">{badge}</p>}
      <div className="mt-4">
        <Versus a={m.teamA} b={m.teamB} slotA={m.phase?.slotA} slotB={m.phase?.slotB} size={featured ? 'xl' : 'lg'} center={center} />
      </div>
      {['LIVE', 'READY', 'SCHEDULED'].includes(m.status) && (
        <p className="mt-3 text-center text-xs font-bold uppercase tracking-wider text-muted">
          {m.tournament?.id
            ? <GoTo to={'/liga/' + m.tournament.id} className="inline">{m.tournament.name}</GoTo>
            : (m.tournament?.name ?? m.tournamentName ?? 'Amistoso')}
          {[MODALITY[m.modality], BRANCH[m.branch]].filter(Boolean).map((x) => ' \u00b7 ' + x).join('')}
        </p>
      )}
      <p className="mt-3 text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>
      <MatchNotice m={m} compact className="mt-2 text-center" />
      {featured && (
        <div className="mt-4 rounded-2xl bg-live py-3 text-center font-extrabold text-black">
          {CTA[m.status] ?? 'Ver partido'}
        </div>
      )}
    </Link>
  )
}
