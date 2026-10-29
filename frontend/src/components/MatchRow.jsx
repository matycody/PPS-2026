import { Link } from 'react-router-dom'
import { Pin, PinOff, Check } from 'lucide-react'
import GoTo from './GoTo'
import TeamBadge from './TeamBadge'
import Forma from './torneo/Forma'
import { BRANCH, MODALITY, STATUS, courtLabel } from '../lib/format'
import { statusBorder } from '../lib/statusStyle'
import { usePipClock } from '../hooks/usePipClock'

const hour = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--')

// Una fila de equipo. Tocar solo el escudo abre el banner del equipo; el nombre y el resto de la fila abren el partido.
// Con "slot" el cruce todavía no está definido: se muestra el lugar (1.°, 2.°…) y quién lo ocupa ahora, como probable.
function Side({ t, slot, form, rank }) {
  if (slot) {
    const who = slot.current?.name ?? (slot.candidates?.length ? slot.candidates.map((c) => c.name).join(' / ') : 'A definir')
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-surface-2 px-1 text-xs font-extrabold text-muted">{slot.big}</div>
        <span className="min-w-0 truncate text-sm font-bold italic text-muted">{who}</span>
      </div>
    )
  }
  if (!t) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-extrabold text-muted">?</div>
        <span className="min-w-0 truncate text-sm font-bold text-muted">Por definir</span>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <GoTo to={'/equipo/' + t.id} className="shrink-0"><TeamBadge team={t} size="sm" /></GoTo>
      <span className="min-w-0 truncate text-sm font-bold">{t.name}</span>
      <span className="flex-1 self-stretch" />
      {rank && <span className="shrink-0 text-[11px] font-bold text-muted">{rank}.º</span>}
      {form?.length > 0 && <span className="shrink-0"><Forma form={form.slice(-3)} size="sm" /></span>} {/* en la tarjeta chica solo los últimos 3 */}
    </div>
  )
}

// Tarjeta chica de partido (programados, habilitados y finalizados). Los partidos en vivo usan MatchCard.
// Props opcionales (listado de admin): to = destino del toque, action = botón abajo a la derecha, footer = contenido bajo la tarjeta,
// selecting/selected/onToggle = modo selección múltiple, flat = sin borde propio (dentro de un bloque de torneo).
export default function MatchRow({ m, to, action, footer, selecting, selected, onToggle, flat }) {
  const pip = usePipClock(m)
  const done = m.status === 'FINISHED'
  const meta = [
    courtLabel(m.court),
    MODALITY[m.modality],
    BRANCH[m.branch],
    m.phase?.label ? (m.phase.kind === 'LEAGUE' && m.phase.zone ? m.phase.zone + ' · ' : '') + m.phase.label : null,
  ].filter(Boolean).join(' · ')
  const s = STATUS[m.status] ?? STATUS.SCHEDULED
  const probable = !done && !!(m.phase?.slotA || m.phase?.slotB) // cruce todavía no definido

  const showAction = !pip.canPin && !selecting && !!action
  return (
    <div className="relative">
      <Link
        to={to ?? '/partido/' + m.id}
        onClick={selecting ? (e) => { e.preventDefault(); onToggle?.() } : undefined}
        className={flat ? 'block px-3 py-2.5 ' + (selected ? 'bg-accent-soft' : '') : 'block rounded-2xl border bg-surface px-3 py-2.5 ' + (selected ? 'border-accent ring-2 ring-accent/40' : statusBorder(m.status))}
      >
        <div className="flex items-stretch gap-3">
          {selecting && (
            <span className={'grid h-6 w-6 shrink-0 self-center place-items-center rounded-md border-2 ' + (selected ? 'border-accent bg-accent text-black' : 'border-line')}>
              {selected && <Check size={16} />}
            </span>
          )}
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
        {probable && <p className="mt-2 inline-block rounded-full bg-warn/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-warn">Probable cruce</p>}
        <p className={(probable ? 'mt-1.5 ' : 'mt-2 ') + 'truncate text-[11px] font-semibold uppercase tracking-wide text-muted ' + (pip.canPin || showAction ? 'pr-10' : '')}>{meta}</p>
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
      {showAction && <div className="absolute bottom-0.5 right-0.5">{action}</div>}
      {footer}
    </div>
  )
}
