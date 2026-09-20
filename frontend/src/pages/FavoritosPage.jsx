import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { api } from '../lib/api'
import TeamBadge from '../components/TeamBadge'

export default function FavoritosPage() {
  const [favs, setFavs] = useState(null)
  const [teams, setTeams] = useState([])
  const [err, setErr] = useState('')

  const loadFavs = () => api('GET', '/favorites').then(setFavs).catch((e) => setErr(e.message))
  useEffect(() => {
    loadFavs()
    api('GET', '/teams').then(setTeams).catch((e) => setErr(e.message))
  }, [])

  const followed = new Set((favs ?? []).filter((f) => f.targetType === 'TEAM').map((f) => f.targetId))

  async function toggle(t) {
    try {
      if (followed.has(t.id)) await api('DELETE', '/favorites/TEAM/' + t.id)
      else await api('POST', '/favorites', { targetType: 'TEAM', targetId: t.id })
      await loadFavs()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="space-y-5">
      {err && <p className="text-danger">{err}</p>}

      <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Mis favoritos</h2>
      {favs === null && <p className="text-muted">Cargando…</p>}
      {favs?.length === 0 && <p className="text-muted">Todavía no seguís a nadie. Tocá el corazón en un equipo.</p>}
      <div className="space-y-2">
        {(favs ?? []).map((f) => (
          <div key={f.targetType + f.targetId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <TeamBadge team={{ name: f.name, logo: f.logo }} />
            {f.targetType === 'TEAM' ? (
              <Link to={'/equipo/' + f.targetId} className="flex-1 truncate font-bold">{f.name}</Link>
            ) : (
              <span className="flex-1 truncate font-bold">{f.name}</span>
            )}
            <span className="text-[11px] font-bold uppercase text-muted">{f.targetType === 'TEAM' ? 'Equipo' : 'Jugador'}</span>
            <button
              aria-label="Dejar de seguir"
              onClick={() => api('DELETE', '/favorites/' + f.targetType + '/' + f.targetId).then(loadFavs).catch((e) => setErr(e.message))}
            >
              <Heart size={20} className="fill-accent text-accent" />
            </button>
          </div>
        ))}
      </div>

      <h2 className="pt-2 text-xs font-bold uppercase tracking-widest text-muted">Equipos</h2>
      <div className="space-y-2">
        {teams.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <TeamBadge team={t} />
            <Link to={'/equipo/' + t.id} className="flex-1 truncate font-bold">{t.name}</Link>
            <button aria-label="Seguir" onClick={() => toggle(t)}>
              <Heart size={20} className={followed.has(t.id) ? 'fill-accent text-accent' : 'text-muted'} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
