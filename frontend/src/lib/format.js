export const BRANCH = { MIXED: 'Mixto', MALE: 'Masculino', FEMALE: 'Femenino' }
export const MODALITY = { FOAM: 'Foam', CLOTH: 'Cloth' }

export const STATUS = {
  SCHEDULED: { label: 'Programado', cls: 'bg-surface-2 text-muted' },
  READY: { label: 'Habilitado', cls: 'bg-accent-soft text-accent' },
  LIVE: { label: 'En vivo', cls: 'bg-danger/15 text-danger' },
  FINISHED: { label: 'Finalizado', cls: 'bg-surface-2 text-muted' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-surface-2 text-muted' },
}

// GET /matches trae "id"; match:updated trae "matchId"
export const normMatch = (m) => ({ ...m, id: m.id ?? m.matchId })

export function fmtWhen(iso) {
  if (!iso) return 'Sin fecha'
  const d = new Date(iso)
  const day = d.toLocaleDateString('es-AR', { weekday: 'long' })
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return day.charAt(0).toUpperCase() + day.slice(1) + ' · ' + time
}


// "3:45" o "03:45" -> segundos. null si no viene o no matchea.
export function toSeconds(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
