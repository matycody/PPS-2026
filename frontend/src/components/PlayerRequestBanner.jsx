import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

// Aviso para cuentas sin perfil: pide el alta, muestra "en revisión" o el motivo del rechazo
export default function PlayerRequestBanner() {
  const user = useAuthStore((s) => s.user)
  const [req, setReq] = useState(undefined)
  const need = user && !user.profileId && !(user.roles ?? []).length

  useEffect(() => {
    if (need) api('GET', '/player-requests/mine').then(setReq).catch(() => setReq(null))
  }, [need])

  if (!need || req === undefined) return null
  const box = 'rounded-2xl border p-4 text-sm '
  if (req?.status === 'PENDING') {
    return <div className={box + 'border-line bg-surface'}><p className="font-bold">Solicitud en revisión</p><p className="mt-1 text-muted">La organización la está revisando. Te habilitan cuando la aprueben.</p></div>
  }
  return (
    <div className={box + (req?.status === 'REJECTED' ? 'border-danger/40 bg-danger/10' : 'border-line bg-surface')}>
      <p className="font-bold">{req?.status === 'REJECTED' ? 'Tu solicitud fue rechazada' : 'Completá tu alta de jugador'}</p>
      {req?.status === 'REJECTED' && <p className="mt-1 text-muted">Motivo: {req.rejectReason}</p>}
      <Link to="/registro" className="mt-2 inline-block font-extrabold text-accent">{req?.status === 'REJECTED' ? 'Enviar otra solicitud' : 'Cargar mis datos'}</Link>
    </div>
  )
}
