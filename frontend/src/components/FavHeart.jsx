import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Star } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useFavorites } from '../stores/favoritesStore'

// Botón para seguir un equipo (corazón) o un torneo (estrella). Sin sesión lleva a iniciar sesión.
export default function FavHeart({ type = 'TEAM', id, name = '', className = '', compact = false }) {
  const uid = useAuthStore((s) => s.user?.id)
  const { teams, tournaments, players, loaded, load, toggle } = useFavorites()
  useEffect(() => { if (uid && !loaded) load() }, [uid, loaded, load])
  if (!id) return null

  const Icon = type === 'TEAM' ? Heart : Star
  const on = (type === 'TEAM' ? teams : type === 'PLAYER' ? players : tournaments).has(id)
  const base = 'grid shrink-0 place-items-center rounded-full ' + (compact ? 'h-9 w-9' : 'h-10 w-10 border border-line bg-surface') + ' ' + className
  const label = (on ? 'Dejar de seguir ' : 'Seguir ') + name

  if (!uid) {
    return <Link to="/login" aria-label={label} className={base + ' text-muted'}><Icon size={compact ? 16 : 18} /></Link>
  }
  return (
    <button type="button" aria-label={label} aria-pressed={on} onClick={() => toggle(type, id).catch(() => {})} className={base + (on ? ' text-accent' : ' text-muted')}>
      <Icon size={compact ? 16 : 18} className={on ? 'fill-current' : ''} />
    </button>
  )
}
