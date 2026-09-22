import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { BRANCH } from '../lib/format'
import TeamBadge from '../components/TeamBadge'
import Roster from '../components/Roster'

export default function TeamPage() {
  const { id } = useParams()
  const user = useAuthStore((s) => s.user)
  const [team, setTeam] = useState(null)
  const [favs, setFavs] = useState([])
  const [err, setErr] = useState('')

  const loadFavs = () => (user ? api('GET', '/favorites').then(setFavs).catch(() => {}) : null)
  useEffect(() => {
    api('GET', '/teams/' + id).then(setTeam).catch((e) => setErr(e.message))
    loadFavs()
  }, [id, user])

  const isFav = (type, tid) => favs.some((f) => f.targetType === type && f.targetId === tid)

  async function toggle(type, tid) {
    try {
      if (isFav(type, tid)) await api('DELETE', '/favorites/' + type + '/' + tid)
      else await api('POST', '/favorites', { targetType: type, targetId: tid })
      await loadFavs()
    } catch (e) { setErr(e.message) }
  }

  if (err && !team) return <p className="mt-10 text-center text-danger">{err}</p>
  if (!team) return <p className="mt-10 text-center text-muted">Cargando…</p>

  const heart = (type, tid) =>
    user && (
      <button aria-label="Seguir" onClick={() => toggle(type, tid)}>
        <Heart size={20} className={isFav(type, tid) ? 'fill-accent text-accent' : 'text-muted'} />
      </button>
    )

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-5">
        <TeamBadge team={team} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold">{team.name}</p>
          <p className="text-sm text-muted">{(team.branches ?? []).map((b) => BRANCH[b] ?? b).join(' · ')}</p>
        </div>
        {heart('TEAM', team.id)}
      </div>

      <Roster roster={team.roster} meProfileId={user?.profileId} extra={(r) => heart('PLAYER', r.profileId)} />
    </div>
  )
}
