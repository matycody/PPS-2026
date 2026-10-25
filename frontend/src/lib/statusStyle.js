// Borde de las tarjetas de partido segun su estado: se usa en todas las listas
export const STATUS_BORDER = {
  SCHEDULED: 'border-yellow-500/40',
  FINISHED: 'border-emerald-500/60',
  READY: 'border-sky-500/50',
  CANCELLED: 'border-danger/40',
  SUSPENDED: 'border-orange-500/40',
}

export const statusBorder = (status, fallback = 'border-line') => STATUS_BORDER[status] ?? fallback
