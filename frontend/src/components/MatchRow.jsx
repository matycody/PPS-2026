import { Link } from 'react-router-dom'
import { Pin, PinOff } from 'lucide-react'
import GoTo from './GoTo'
import TeamBadge from './TeamBadge'
import Forma from './torneo/Forma'
import { BRANCH, MODALITY, STATUS, courtLabel } from '../lib/format'
import { statusBorder } from '../lib/statusStyle'
import { usePipClock } from '../hooks/usePipClock'

const hour = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--')

// Una fila de equipo: escudo + nombre (tocar abre el banner del equipo), posición y racha V/E/D
function Side({ t, slot, form, rank }) {
  if (!t) {
    const txt = slot ? slot.big + (slot.sub ? ' · ' + slot.sub : '') : 'Por definir'
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-extrabold text-muted">?</div>
        <span className="min-w-0 truncate text-sm font-bold text-muted">{txt}</span>
      </div>
    )
  }
  return (
    <GoTo to={'/equipo/' + t.id} className="flex min-w-0 items-center gap-2">
      <TeamBadge team={t} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.name}</span>
      {rank && <span className="shrink-0 text-[11px] font-bold text-muted">{rank}.º</span>}
      {form?.length > 0 && <span className="shrink-0"><Forma form={form} size="sm" /></span>}
    </GoTo>
  )
}

// Tarjeta chica de partido (programados, habilitados y finalizados). Los partidos en vivo usan MatchCard.
export default function MatchRow({ m }) {
  const pip = usePipClock(m)
  const done = m.status === 'FINISHED'
  const meta = [
    courtLabel(m.court),
    MODALITY[m.modality],
    BRANCH[m.branch],
    m.phase?.label ? (m.phase.kind === 'LEAGUE' && m.phase.zone ? m.phase.zone + ' · ' : '') + m.phase.label : null,
  ].filter(Boolean).join(' · ')
  const s = STATUS[m.status] ?? STATUS.SCHEDULED

  return (
    <div className="relative">
      <Link to={'/partido/' + m.id} className={'block rounded-2xl border bg-surface px-3 py-2.5 ' + statusBorder(m.status)}>
        <div className="flex items-stretch gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Side t={m.teamA} slot={m.phase?.slotA} form={m.form?.A} rank={m.form?.rankA} />
            <Side t={m.teamB} slot={m.phase?.slotB} form={m.form?.B} rank={m.form?.rankB} />
          </div>
          <div className="flex w-[72px] shrink-0 flex-col items-center justify-center border-l border-line pl-3 text-center">
            {done ? (
              <span className="font-mono text-xl font-extrabold tabular-nums">{m.score?.teamA ?? 0}-{m.score?.teamB ?? 0}</span>
            ) : (
              <span className="font-mono text-xl font-extrabold tabular-nums">{hour(m.scheduledAt)}</span>
            )}
            <span className={'mt-0.5 text-[10px] font-bold uppercase leading-tight ' + (m.status === 'CANCELLED' ? 'text-danger' : 'text-muted')}>{s.label}</span>
          </div>
        </div>
        <p className={'mt-2 truncate text-[11px] font-semibold uppercase tracking-wide text-muted ' + (pip.canPin ? 'pr-10' : '')}>{meta}</p>
      </Link>
      {pip.canPin && (
        <button
          type="button"
          onClick={pip.toggle}
          aria-label={pip.active ? 'Quitar reloj flotante' : 'Fijar reloj flotante'}
          aria-pressed={pip.active}
          className={'absolute bottom-0.5 right-0.5 grid h-9 w-9 place-items-center rounded-full ' + (pip.active ? 'text-live' : 'text-muted')}
        >
          {pip.active ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
      )}
    </div>
  )
}
