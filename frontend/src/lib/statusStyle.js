// Borde de las tarjetas de partido segun su estado: se usa en todas las listas
export const STATUS_BORDER = {
  SCHEDULED: 'border-yellow-500/40',
  READY: 'border-live/40',
  CANCELLED: 'border-danger/40',
}

export const statusBorder = (status, fallback = 'border-line') => STATUS_BORDER[status] ?? fallback
