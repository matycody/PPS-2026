import { fmtWhen } from '../lib/format'

// Por qué un partido se suspendió, se canceló o se reprogramó (lo ve cualquier usuario)
export function noticeOf(m) {
  if (!m) return null
  const moved = m.originalScheduledAt && m.scheduledAt && new Date(m.originalScheduledAt).getTime() !== new Date(m.scheduledAt).getTime()
  if (m.status === 'SUSPENDED') {
    return {
      tone: 'warn',
      title: 'Partido suspendido',
      note: m.statusReason,
      extra: (m.originalScheduledAt ? 'Estaba programado para ' + fmtWhen(m.originalScheduledAt) + '. ' : '') + 'Todavía no tiene nueva fecha.',
    }
  }
  if (m.status === 'CANCELLED') return { tone: 'danger', title: 'Partido cancelado', note: m.statusReason }
  if (moved && ['SCHEDULED', 'READY', 'LIVE'].includes(m.status)) {
    return { tone: 'warn', title: 'Partido reprogramado', note: m.statusReason, extra: 'Estaba programado para ' + fmtWhen(m.originalScheduledAt) }
  }
  return null
}

const TEXT = { warn: 'text-warn', danger: 'text-danger' }
const BOX = { warn: 'box-warn', danger: 'box-danger' }

export default function MatchNotice({ m, compact = false, className = '' }) {
  const n = noticeOf(m)
  if (!n) return null
  if (compact) {
    return <p className={'text-xs font-semibold ' + TEXT[n.tone] + ' ' + className}>{n.title}{n.note ? ': ' + n.note : ''}</p>
  }
  return (
    <div className={'space-y-1 rounded-2xl border px-4 py-3 text-sm ' + BOX[n.tone] + ' ' + className}>
      <p className={'font-extrabold ' + TEXT[n.tone]}>{n.title}</p>
      {n.note && <p>{n.note}</p>}
      {n.extra && <p className="text-xs text-muted">{n.extra}</p>}
    </div>
  )
}
