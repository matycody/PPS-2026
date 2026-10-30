import { MapPin, Navigation } from 'lucide-react'
import { mapLinks } from '../lib/maps'

// Bloque "Dónde se juega": nombre, dirección y botones para abrir el mapa
export default function VenueInfo({ venue, className = '', compact = false }) {
  if (!venue) return null
  const links = mapLinks(venue)
  if (compact) {
    // Una sola línea (para pantallas donde importa el espacio, como un partido en vivo)
    const pill = 'shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-bold'
    return (
      <div className={'flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 ' + className}>
        <MapPin size={16} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-bold">{venue.name}</span>
        <a href={links.google} target="_blank" rel="noopener noreferrer" className={pill}>Google</a>
        <a href={links.apple} target="_blank" rel="noopener noreferrer" className={pill}>Apple</a>
      </div>
    )
  }
  const btn = 'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-bold'
  return (
    <div className={'space-y-2 rounded-2xl border border-line bg-surface p-4 text-left ' + className}>
      <div className="flex items-start gap-2">
        <MapPin size={18} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0">
          <div className="font-extrabold leading-tight">{venue.name}</div>
          <div className="text-sm text-muted">{venue.address}</div>
          {venue.notes && <div className="mt-1 text-xs text-muted">{venue.notes}</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={links.google} target="_blank" rel="noopener noreferrer" className={btn}><Navigation size={14} /> Google Maps</a>
        <a href={links.apple} target="_blank" rel="noopener noreferrer" className={btn}><Navigation size={14} /> Apple Maps</a>
      </div>
    </div>
  )
}
