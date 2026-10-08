import { STATUS } from '../lib/format'

export default function StatusPill({ status }) {
  const s = STATUS[status] ?? STATUS.SCHEDULED
  return (
    <span className={'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase ' + (status === 'CANCELLED' ? 'bg-danger/15 text-danger' : status === 'SCHEDULED' ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400' : s.cls)}>
      {status === 'LIVE' && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
      {s.label}
    </span>
  )
}
