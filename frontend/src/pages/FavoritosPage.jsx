import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { api } from '../lib/api'
import TeamBadge from '../components/TeamBadge'
import PersonName from '../components/PersonName'
import { BRANCH, MODALITY } from '../lib/format'

export default function FavoritosPage() {
  const [favs, setFavs] = useState(null)
  const [teams, setTeams] = useState([])
  const [tournaments, setTournaments] = useState([])
  const [err, setErr] = useState('')

  const loadFavs = () => api('GET', '/favorites').then(setFavs).catch((e) => setErr(e.message))
  useEffect(() => {
    loadFavs()
    api('GET', '/teams').then(setTeams).catch((e) => setErr(e.message))
    api('GET', '/tournaments?limit=200').then(setTournaments).catch((e) => setErr(e.message))
  }, [])

  const followed = new Set((favs ?? []).filter((f) => f.targetType === 'TEAM').map((f) => f.targetId))
  const followedT = new Set((favs ?? []).filter((f) => f.targetType === 'TOURNAMENT').map((f) => f.targetId))

  async function toggle(t, type = 'TEAM') {
    const on = (type === 'TEAM' ? followed : followedT).has(t.id)
    try {
      if (on) await api('DELETE', '/favorites/' + type + '/' + t.id)
      else await api('POST', '/favorites', { targetType: type, targetId: t.id })
      await loadFavs()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="space-y-5">
      {err && <p className="text-danger">{err}</p>}

      <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Mis favoritos</h2>
      {favs === null && <p className="text-muted">Cargando…</p>}
      {favs?.length === 0 && <p className="text-muted">Todavía no seguís a nadie. Tocá el corazón en un equipo o torneo.</p>}
      <div className="space-y-2">
        {(favs ?? []).map((f) => (
          <div key={f.targetType + f.targetId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <TeamBadge team={{ name: f.name, logo: f.logo }} />
            {f.targetType === 'TEAM' ? (
              <Link to={'/equipo/' + f.targetId} className="flex-1 truncate font-bold">{f.name}</Link>
            ) : f.targetType === 'TOURNAMENT' ? (
              <Link to={'/liga/' + f.targetId} className="flex-1 truncate font-bold">{f.name}</Link>
            ) : (
              <Link to={'/jugador/' + f.targetId} className="flex-1 truncate font-bold"><PersonName p={f} /></Link>
            )}
            <span className="text-[11px] font-bold uppercase text-muted">{f.targetType === 'TEAM' ? 'Equipo' : f.targetType === 'TOURNAMENT' ? 'Torneo' : 'Jugador'}</span>
            <button
              aria-label="Dejar de seguir"
              onClick={() => api('DELETE', '/favorites/' + f.targetType + '/' + f.targetId).then(loadFavs).catch((e) => setErr(e.message))}
            >
              <Heart size={20} className="fill-accent text-accent" />
            </button>
          </div>
        ))}
      </div>

      <h2 className="pt-2 text-xs font-bold uppercase tracking-widest text-muted">Torneos</h2>
      <div className="space-y-2">
        {tournaments.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <TeamBadge team={t} />
            <Link to={'/liga/' + t.id} className="min-w-0 flex-1">
              <span className="block truncate font-bold">{t.name}</span>
              <span className="block truncate text-[11px] font-semibold uppercase text-muted">{[MODALITY[t.modality], BRANCH[t.branch]].filter(Boolean).join(' · ')}</span>
            </Link>
            <button aria-label={followedT.has(t.id) ? 'Dejar de seguir' : 'Seguir'} onClick={() => toggle(t, 'TOURNAMENT')}>
              <Heart size={20} className={followedT.has(t.id) ? 'fill-accent text-accent' : 'text-muted'} />
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

