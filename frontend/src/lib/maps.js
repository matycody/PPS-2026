// Enlaces para llegar a una sede. Con coordenadas apuntan al punto exacto; si no, buscan por dirección.
export function mapLinks(v) {
  if (!v) return null
  const hasCoords = v.latitude != null && v.longitude != null
  const text = encodeURIComponent([v.name, v.address].filter(Boolean).join(', '))
  const google = v.mapUrl || (hasCoords
    ? 'https://www.google.com/maps/search/?api=1&query=' + v.latitude + ',' + v.longitude
    : 'https://www.google.com/maps/search/?api=1&query=' + text)
  const apple = hasCoords
    ? 'https://maps.apple.com/?ll=' + v.latitude + ',' + v.longitude + '&q=' + encodeURIComponent(v.name || 'Sede')
    : 'https://maps.apple.com/?q=' + text
  return { google, apple }
}

// Texto corto para tarjetas: "Polideportivo X"
export const venueName = (m) => m?.venue?.name ?? null
