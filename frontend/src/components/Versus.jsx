import TeamBadge from './TeamBadge'
import GoTo from './GoTo'

// Equipo A | centro (VS, marcador o reloj) | Equipo B. Todo centrado, con escudos.
export default function Versus({ a, b, center, size = 'lg', noLink = false }) {
  const side = (t) => {
    const body = (
      <>
        <TeamBadge team={t} size={size} />
        <span className="w-full break-words text-sm font-bold leading-tight">{t?.name ?? 'Por definir'}</span>
      </>
    )
    const cls = 'flex min-w-0 flex-col items-center gap-2 text-center'
    // Tocar el escudo o el nombre abre el banner del equipo
    // noLink: en la pantalla de control (mesa/árbitro) no hay navegación accidental
    return t?.id && !noLink ? <GoTo to={'/equipo/' + t.id} className={cls}>{body}</GoTo> : <div className={cls}>{body}</div>
  }
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      {side(a)}
      <div className="flex flex-col items-center text-center">
        {center ?? <span className="text-sm font-extrabold tracking-widest text-muted">VS</span>}
      </div>
      {side(b)}
    </div>
  )
}
