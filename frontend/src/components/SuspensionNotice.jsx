import { Gavel } from 'lucide-react'
import { MODALITY } from '../lib/format'

// Texto de lo que le falta cumplir: "resto de la jornada + 2 fechas"
export function suspensionText(s) {
  const parts = []
  if (s.sameDayLeft) parts.push('resto de la jornada')
  if (s.remaining > 0) parts.push(s.remaining + (s.remaining === 1 ? ' fecha' : ' fechas'))
  return parts.join(' + ')
}
export const suspensionScope = (s) => (s.scope === 'ALL' ? 'todas las modalidades' : MODALITY[s.modality] ?? 'su modalidad')

// Cartel de suspensión vigente (banner del jugador y perfil propio)
export default function SuspensionNotice({ s, self }) {
  if (!s) return null
  return (
    <div className="flex items-start gap-3 rounded-2xl border box-danger px-4 py-3 text-danger">
      <Gavel size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="font-extrabold">{self ? 'Estás suspendido' : 'Suspendido'} · {suspensionText(s)}</p>
        <p className="text-xs font-semibold">Alcance: {suspensionScope(s)}. Decisión del departamento de sanciones.</p>
        {s.note && <p className="mt-0.5 text-xs">{s.note}</p>}
      </div>
    </div>
  )
}
