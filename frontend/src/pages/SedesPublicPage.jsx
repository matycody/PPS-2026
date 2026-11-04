import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import VenueInfo from '../components/VenueInfo'

// Dónde se juega durante el año (visible para todos los roles)
export default function SedesPublicPage() {
  const [list, setList] = useState(null)
  useEffect(() => { api('GET', '/venues/public').then(setList).catch(() => setList(false)) }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Sedes</h1>
      <p className="text-xs text-muted">Los lugares donde se juegan las fechas durante el año.</p>
      {list === null && <p className="text-muted">Cargando…</p>}
      {list === false && <p className="text-danger">No se pudieron cargar las sedes.</p>}
      {list?.length === 0 && <p className="text-muted">Todavía no hay sedes cargadas.</p>}
      {(list ?? []).map((v) => (
        <div key={v.id} className="space-y-1">
          <VenueInfo venue={v} />
          {v.courts ? <p className="px-2 text-xs text-muted">{v.courts} {v.courts === 1 ? 'cancha' : 'canchas'}</p> : null}
        </div>
      ))}
    </div>
  )
}
