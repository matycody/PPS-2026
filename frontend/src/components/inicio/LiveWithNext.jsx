import MatchCard from '../MatchCard'
import MatchRow from '../MatchRow'
import { useLiveTick } from '../../lib/liveTicks'
import { courtLabel } from '../../lib/format'

const LEFT_WARN = 10 * 60 // segundos del 2do tiempo desde los que se avisa el próximo partido de la cancha
// "9:48" -> 588
const secs = (t) => { const [m, s] = String(t ?? '').split(':').map(Number); return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null }

// Partido en vivo y, cuando al 2do tiempo le faltan menos de 10 minutos, el próximo de esa cancha en chiquito.
// `next` ya viene elegido por el Inicio (mismo criterio que ordena la jornada: horario, o el orden del fixture si todavía no hay horario).
export default function LiveWithNext({ m, next, featured = false }) {
  const tick = useLiveTick(m.id, true)
  const left = secs(tick?.matchTime)
  const show = !!next && tick?.matchHalf === 2 && left != null && left < LEFT_WARN

  return (
    <div className="space-y-2">
      <MatchCard m={m} featured={featured} />
      {show && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-warn">Próximo en {courtLabel(m.court)}</div>
          <MatchRow m={next} flat />
        </div>
      )}
    </div>
  )
}
