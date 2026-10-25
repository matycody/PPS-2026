import TeamBadge from './TeamBadge'
import GoTo from './GoTo'
import Forma from './torneo/Forma'

// Equipo A | centro (VS, marcador o reloj) | Equipo B. Todo centrado, con escudos.
// Lugar todavía sin equipo: "1°" en grande, la zona o la ronda de origen y quién lo ocupa en este momento
function SlotSide({ slot }) {
  const names = (slot.candidates ?? []).map((t) => t.name)
  const now = slot.current ? 'Actual: ' + slot.current.name : names.length ? 'Posibles: ' + names.join(' / ') : 'A definir'
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <span className={'font-extrabold leading-none ' + (slot.big.length > 4 ? 'text-xl' : 'text-5xl')}>{slot.big}</span>
      {slot.sub && <span className="text-xs font-bold uppercase tracking-wider text-muted">{slot.sub}</span>}
      <span className="w-full break-words text-xs text-muted">{now}</span>
    </div>
  )
}

export default function Versus({ a, b, center, size = 'lg', noLink = false, slotA = null, slotB = null, formA = null, formB = null, rankA = null, rankB = null }) {
  const side = (t, slot, form, rank) => {
    if (slot) return <SlotSide slot={slot} /> // el backend manda el lugar solo si todavía no está definido
    const body = (
      <>
        <TeamBadge team={t} size={size} />
        <span className="w-full break-words text-sm font-bold leading-tight">{t?.name ?? 'Por definir'}</span>
        {t && rank && <span className="text-[11px] font-bold leading-none text-muted">{rank}.º</span>}
        {t && form?.length > 0 && <Forma form={form} size="sm" />}
      </>
    )
    const cls = 'flex min-w-0 flex-col items-center gap-2 text-center'
    // Tocar el escudo o el nombre abre el banner del equipo
    // noLink: en la pantalla de control (mesa/árbitro) no hay navegación accidental
    return t?.id && !noLink ? <GoTo to={'/equipo/' + t.id} className={cls}>{body}</GoTo> : <div className={cls}>{body}</div>
  }
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      {side(a, slotA, formA, rankA)}
      <div className="flex flex-col items-center text-center">
        {center ?? <span className="text-sm font-extrabold tracking-widest text-muted">VS</span>}
      </div>
      {side(b, slotB, formB, rankB)}
    </div>
  )
}
