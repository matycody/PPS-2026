import { personNumber } from '../lib/person'

// Muestra el apodo en lugar del nombre y el número al costado (#7).
// showReal: para pantallas de administración, muestra el nombre real y el apodo entre comillas.
export default function PersonName({ p, fallback = '', showReal = false, className = '' }) {
  const nick = p?.nickname?.trim()
  const real = p?.name || fallback
  const num = personNumber(p)
  return (
    <span className={className}>
      {showReal ? real : nick || real}
      {showReal && nick && <span className="ml-1.5 font-normal text-muted">“{nick}”</span>}
      {num != null && <span className="ml-1.5 font-mono text-xs font-bold text-muted">#{num}</span>}
    </span>
  )
}
