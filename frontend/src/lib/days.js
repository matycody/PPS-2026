// Días de las jornadas (hora local del navegador, formato YYYY-MM-DD)
export const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : null)
const diffDays = (day) => Math.round((new Date(day + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 864e5)

// Ayer / Hoy / Mañana cuando está cerca; si no, "Dom 8/11"
export function dayTab(day) {
  const d = diffDays(day)
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Mañana'
  if (d === -1) return 'Ayer'
  const dt = new Date(day + 'T12:00:00')
  const wd = dt.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')
  return wd.charAt(0).toUpperCase() + wd.slice(1) + ' ' + dt.getDate() + '/' + (dt.getMonth() + 1)
}
